/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-console */
import { OpenAPIV3 } from 'openapi-types'
import * as E from 'fp-ts/lib/Either'
import * as A from 'fp-ts/lib/Array'
import * as I from 'fp-ts/lib/Identity'
import { pipe } from 'fp-ts/lib/pipeable'
import * as O from 'fp-ts/lib/Option'
import * as gen from '@drdgvhbh/io-ts-codegen'
import * as t from 'io-ts'

export type SchemaObject =
  | OpenAPIV3.ReferenceObject
  | OpenAPIV3.SchemaObject
  | OpenAPIV3.BaseSchemaObject

export const isArraySchemaObject = O.getRefinement<
  SchemaObject,
  OpenAPIV3.ArraySchemaObject
>((schema) =>
  'items' in schema ? O.some(schema as OpenAPIV3.ArraySchemaObject) : O.none,
)

export const isNonArraySchemaObject = O.getRefinement<
  SchemaObject,
  OpenAPIV3.NonArraySchemaObject
>((schema) =>
  'type' in schema && !isArraySchemaObject(schema)
    ? O.some(schema as OpenAPIV3.NonArraySchemaObject)
    : O.none,
)

export const isReferenceObject = O.getRefinement<
  SchemaObject,
  OpenAPIV3.ReferenceObject
>((schema) =>
  '$ref' in schema ? O.some(schema as OpenAPIV3.ReferenceObject) : O.none,
)

export function mapNonArraySchemaObjectType(
  type: OpenAPIV3.NonArraySchemaObjectType,
): gen.BasicType {
  switch (type) {
    case 'object':
      return gen.unknownRecordType
    case 'boolean':
      return gen.booleanType
    case 'integer':
      return gen.integerType
    case 'null':
      return gen.nullType
    case 'number':
      return gen.numberType
    case 'string':
      return gen.stringType
  }
}

export function handleStringProperty(
  schema: OpenAPIV3.BaseSchemaObject,
  schemaName: string,
  isRequired: boolean,
): O.Option<gen.Property> {
  return pipe(
    schema.enum,
    E.fromNullable(
      O.some(gen.property(schemaName, gen.stringType, !isRequired)),
    ),
    E.chain((enums) =>
      pipe(
        t.array(t.string).decode(enums),
        E.mapLeft(() => O.none as O.Option<gen.Property>),
        E.map((values) =>
          O.some(
            gen.property(schemaName, gen.keyofCombinator(values), !isRequired),
          ),
        ),
      ),
    ),
    E.fold(
      (e) => e,
      (a) => a,
    ),
  )
}

export function collectObjectProperties(
  propertyObjects: Array<SchemaObject>,
): gen.TypeReference[] {
  return pipe(
    A.array.map(propertyObjects, (propertyObject) => {
      if (isReferenceObject(propertyObject)) {
        const componentName = extractComponentIdentifier(propertyObject.$ref)
        return O.some(gen.identifier(componentName) as gen.TypeReference)
      } else if (isArraySchemaObject(propertyObject)) {
        return O.none
      } else if (isNonArraySchemaObject(propertyObject)) {
        switch (propertyObject.type) {
          case 'object':
            return O.some(
              gen.typeCombinator(
                pipe(propertyObject, collectSchemaProperties),
              ) as gen.TypeReference,
            )
          default:
            return O.none
        }
      } else {
        return O.none
      }
    }),
    A.filter(O.isSome),
    (nestedProperties) => nestedProperties.map((v) => v.value),
  )
}

export function extractComponentIdentifier($ref: string): string {
  const tokens = $ref.split('/')

  return tokens[tokens.length - 1]
}

export function collectProperties(
  properties: Record<string, SchemaObject>,
  requiredProperties: Set<string>,
): gen.Property[] {
  return pipe(properties, (properties) =>
    pipe(
      Object.keys(properties),
      A.map((propertyName) =>
        handlePropertyObject(
          properties[propertyName],
          propertyName,
          requiredProperties.has(propertyName),
        ),
      ),
      A.filter(O.isSome),
      A.map((someProperty) => someProperty.value),
    ),
  )
}

export function collectSchemaProperties(
  schema: OpenAPIV3.SchemaObject,
): gen.Property[] {
  return pipe(
    [schema.properties || {}, new Set(schema.required || [])] as const,
    ([properties, requiredProperties]) =>
      collectProperties(properties, requiredProperties),
  )
}

export function handleArraySchemaObject(
  schema: OpenAPIV3.ArraySchemaObject,
): gen.ArrayCombinator {
  const { items } = schema
  if (isReferenceObject(items)) {
    const itemComponentName = extractComponentIdentifier(items.$ref)

    return gen.arrayCombinator(gen.identifier(itemComponentName))
  } else if (isArraySchemaObject(items)) {
    return gen.arrayCombinator(handleArraySchemaObject(items))
  } else {
    switch (items.type) {
      case 'object':
        return pipe(
          items,
          collectSchemaProperties,
          gen.typeCombinator,
          gen.arrayCombinator,
        )
      default:
        return pipe(
          items.type,
          mapNonArraySchemaObjectType,
          gen.arrayCombinator,
        )
    }
  }
}

export function handlePropertyObject(
  schema: SchemaObject,
  schemaName: string,
  isRequired: boolean,
): O.Option<gen.Property> {
  if (isReferenceObject(schema)) {
    const componentName = extractComponentIdentifier(schema.$ref)
    return pipe(
      gen.property(schemaName, gen.identifier(componentName), !isRequired),
      O.some,
    )
  } else if (isArraySchemaObject(schema)) {
    return O.some(
      gen.property(schemaName, handleArraySchemaObject(schema), !isRequired),
    )
  } else if (isNonArraySchemaObject(schema)) {
    switch (schema.type) {
      case 'object':
        return pipe(
          schema,
          collectSchemaProperties,
          (properties) =>
            gen.property(
              schemaName,
              gen.typeCombinator(properties),
              !isRequired,
            ),
          O.some,
        )
      case 'string':
        return handleStringProperty(schema, schemaName, isRequired)
      default:
        return pipe(
          schema.type,
          mapNonArraySchemaObjectType,
          (type) => gen.property(schemaName, type, !isRequired),
          O.some,
        )
    }
  } else {
    return O.none as never
  }
}

export function handleObjectSchemaDeclaration(
  schema: OpenAPIV3.BaseSchemaObject,
  schemaName: string,
): O.Option<gen.TypeDeclaration> {
  return pipe(
    [schema.properties || {}, new Set(schema.required || [])] as const,
    ([properties, requiredProperties]) =>
      pipe(collectProperties(properties, requiredProperties), (properties) =>
        gen.typeCombinator(properties),
      ),
    (properties) => {
      if (schema.allOf) {
        return gen.intersectionCombinator(
          [...collectObjectProperties(schema.allOf)].concat(
            schema.properties ? properties : [],
          ),
        )
      } else if (schema.oneOf) {
        return schema.properties
          ? gen.intersectionCombinator([
              properties,
              gen.unionCombinator(collectObjectProperties(schema.oneOf)),
            ])
          : gen.unionCombinator(collectObjectProperties(schema.oneOf))
      } else {
        return properties
      }
    },
    (properties) => gen.typeDeclaration(schemaName, properties, true),
    O.some,
  )
}

export function handleStringDeclaration(
  schema: OpenAPIV3.BaseSchemaObject,
  schemaName: string,
): O.Option<gen.TypeDeclaration> {
  return pipe(
    schema.enum,
    E.fromNullable(
      O.some(gen.typeDeclaration(schemaName, gen.stringType, true)),
    ),
    E.chain((enums) =>
      pipe(
        t.array(t.string).decode(enums),
        E.mapLeft(() => O.none as O.Option<gen.TypeDeclaration>),
        E.map((values) =>
          O.some(
            gen.typeDeclaration(schemaName, gen.keyofCombinator(values), true),
          ),
        ),
      ),
    ),
    E.fold(
      (e) => e,
      (a) => a,
    ),
  )
}

export function handleRootSchema(
  schema: SchemaObject,
  schemaName: string,
): O.Option<gen.TypeDeclaration> {
  if (isReferenceObject(schema)) {
    return O.none
  } else if (isArraySchemaObject(schema)) {
    return O.none
  } else if (isNonArraySchemaObject(schema)) {
    switch (schema.type) {
      case 'object':
        return handleObjectSchemaDeclaration(schema, schemaName)
      case 'boolean':
        return O.some(gen.typeDeclaration(schemaName, gen.booleanType, true))
      case 'integer':
        return O.some(gen.typeDeclaration(schemaName, gen.integerType, true))
      case 'null':
        return O.some(gen.typeDeclaration(schemaName, gen.nullType, true))
      case 'number':
        return O.some(gen.typeDeclaration(schemaName, gen.numberType, true))
      case 'string':
        return handleStringDeclaration(schema, schemaName)
    }
  } else {
    if (schema.allOf) {
      return O.some(
        gen.typeDeclaration(
          schemaName,
          pipe(
            collectObjectProperties(schema.allOf || []),
            gen.intersectionCombinator,
          ),
        ),
      )
    } else if (schema.oneOf) {
      return O.some(
        gen.typeDeclaration(
          schemaName,
          pipe(
            collectObjectProperties(schema.oneOf || []),
            gen.unionCombinator,
          ),
        ),
      )
    } else {
      return O.none
    }
  }
}

export function handleSchemas(
  schemas: Record<string, SchemaObject>,
): O.Option<gen.TypeDeclaration>[] {
  return pipe(Object.keys(schemas), (schemaNames) =>
    A.array.traverse(I.identity)(schemaNames, (schemaName) =>
      pipe(schemas[schemaName], (schema) =>
        handleRootSchema(schema, schemaName),
      ),
    ),
  )
}
export function handleComponents(
  components: OpenAPIV3.ComponentsObject,
): O.Option<gen.TypeDeclaration>[] {
  return pipe(
    components.schemas,
    E.fromNullable([] as Array<O.Option<gen.TypeDeclaration>>),
    E.map(handleSchemas),
    E.fold(
      (e) => e,
      (a) => a,
    ),
  )
}

export function handleDocument(
  document: OpenAPIV3.Document,
): O.Option<gen.TypeDeclaration>[] {
  return pipe(
    document.components,
    E.fromNullable([] as Array<O.Option<gen.TypeDeclaration>>),
    E.map(handleComponents),
    E.fold(
      (e) => e,
      (a) => a,
    ),
  )
}
