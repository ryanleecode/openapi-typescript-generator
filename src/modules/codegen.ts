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
import * as S from 'fp-ts/lib/Set'
import { eq, eqString } from 'fp-ts/lib/Eq'

export type SchemaObject =
  | OpenAPIV3.ReferenceObject
  | OpenAPIV3.ArraySchemaObject
  | OpenAPIV3.NonArraySchemaObject

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

export function handleStringProperty(
  schema: OpenAPIV3.BaseSchemaObject,
  schemaName: string,
  isRequired: boolean,
): O.Option<gen.Property> {
  return pipe(
    schema.enum,
    E.fromNullable(
      O.some(gen.property(schemaName, gen.stringType, isRequired)),
    ),
    E.chain((enums) =>
      pipe(
        t.array(t.string).decode(enums),
        E.mapLeft(() => O.none as O.Option<gen.Property>),
        E.map((values) =>
          O.some(
            gen.property(schemaName, gen.keyofCombinator(values), isRequired),
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

export function handlePropertyObject(
  schema: SchemaObject,
  schemaName: string,
  isRequired: boolean,
): O.Option<gen.Property> {
  if (isReferenceObject(schema)) {
    return O.none
  } else if (isArraySchemaObject(schema)) {
    return O.none
  } else if (isNonArraySchemaObject(schema)) {
    switch (schema.type) {
      case 'object':
        return pipe(
          [schema.properties || {}, new Set(schema.required || [])] as const,
          ([properties, requiredProperties]) =>
            collectProperties(properties, requiredProperties),
          (properties) =>
            gen.property(
              schemaName,
              gen.typeCombinator(properties),
              isRequired,
            ),
          O.some,
        )
      case 'boolean':
        return O.some(gen.property(schemaName, gen.booleanType, isRequired))
      case 'integer':
        return O.some(gen.property(schemaName, gen.integerType, isRequired))
      case 'null':
        return O.some(gen.property(schemaName, gen.nullType, isRequired))
      case 'number':
        return O.some(gen.property(schemaName, gen.numberType, isRequired))
      case 'string':
        return handleStringProperty(schema, schemaName, isRequired)
    }
  }

  return O.none
}

export function handleObjectSchemaDeclaration(
  schema: OpenAPIV3.BaseSchemaObject,
  schemaName: string,
): O.Option<gen.TypeDeclaration> {
  return pipe(
    [schema.properties || {}, new Set(schema.required || [])] as const,
    ([properties, requiredProperties]) =>
      collectProperties(properties, requiredProperties),
    (properties) =>
      gen.typeDeclaration(schemaName, gen.typeCombinator(properties), true),
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
  }

  return O.none
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
