import { OpenAPIV3 } from 'openapi-types'
import { handleRootSchema } from '../io'
import * as O from 'fp-ts/lib/Option'
import { pipe } from 'fp-ts/lib/pipeable'
import { TypeDeclaration } from '@drdgvhbh/io-ts-codegen'

describe('codegen tests', () => {
  describe('root declarations', () => {
    test('expect root declaration reference object to return none', () => {
      const schemaName = 'TestType'
      const schema: OpenAPIV3.ReferenceObject = {
        $ref: `#/components/schemas/${schemaName}`,
      }
      expect(handleRootSchema(schema, schemaName)).toEqual(O.none)
    })

    test('expect root declaration boolean object to return boolean declaration', () => {
      const schemaName = 'BooleanType'
      const schema: OpenAPIV3.NonArraySchemaObject = {
        type: 'boolean',
      }

      const expected: TypeDeclaration = {
        kind: 'TypeDeclaration',
        name: schemaName,
        type: { kind: 'BooleanType', name: 'boolean' },
        isExported: true,
        isReadonly: false,
      }

      const result = handleRootSchema(schema, schemaName)
      expect(O.isSome(result)).toEqual(true)
      pipe(
        result,
        O.map((a) => expect(a).toEqual(expected)),
      )
    })

    test('expect root declaration string object to return string declaration', () => {
      const schemaName = 'StringType'
      const schema: OpenAPIV3.NonArraySchemaObject = {
        type: 'string',
      }

      const expected: TypeDeclaration = {
        kind: 'TypeDeclaration',
        name: schemaName,
        type: { kind: 'StringType', name: 'string' },
        isExported: true,
        isReadonly: false,
      }

      const result = handleRootSchema(schema, schemaName)
      expect(O.isSome(result)).toEqual(true)
      pipe(
        result,
        O.map((a) => expect(a).toEqual(expected)),
      )
    })

    test('expect root declaration null object to return null declaration', () => {
      const schemaName = 'NullType'
      const schema: OpenAPIV3.NonArraySchemaObject = {
        type: 'null',
      }

      const expected: TypeDeclaration = {
        kind: 'TypeDeclaration',
        name: schemaName,
        type: { kind: 'NullType', name: 'null' },
        isExported: true,
        isReadonly: false,
      }

      const result = handleRootSchema(schema, schemaName)
      expect(O.isSome(result)).toEqual(true)
      pipe(
        result,
        O.map((a) => expect(a).toEqual(expected)),
      )
    })

    test('expect root declaration number object to return number declaration', () => {
      const schemaName = 'NumberType'
      const schema: OpenAPIV3.NonArraySchemaObject = {
        type: 'number',
      }

      const expected: TypeDeclaration = {
        kind: 'TypeDeclaration',
        name: schemaName,
        type: { kind: 'NumberType', name: 'number' },
        isExported: true,
        isReadonly: false,
      }

      const result = handleRootSchema(schema, schemaName)
      expect(O.isSome(result)).toEqual(true)
      pipe(
        result,
        O.map((a) => expect(a).toEqual(expected)),
      )
    })

    test('expect root declaration integer object to return integer declaration', () => {
      const schemaName = 'IntegerType'
      const schema: OpenAPIV3.NonArraySchemaObject = {
        type: 'integer',
      }

      const expected: TypeDeclaration = {
        kind: 'TypeDeclaration',
        name: schemaName,
        type: { kind: 'IntegerType', name: 'Integer' },
        isExported: true,
        isReadonly: false,
      }

      const result = handleRootSchema(schema, schemaName)
      expect(O.isSome(result)).toEqual(true)
      pipe(
        result,
        O.map((a) => expect(a).toEqual(expected)),
      )
    })
  })
})
