/*
*                      Copyright 2024 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import _ from 'lodash'
import { collections, regex, strings, types as lowerdashTypes } from '@salto-io/lowerdash'
import { Values } from '@salto-io/adapter-api'
import { CUSTOM_RECORD_TYPE, CUSTOM_SEGMENT } from './constants'
import { TYPES_TO_INTERNAL_ID } from './data_elements/types'
import { netsuiteSupportedTypes, removeCustomRecordTypePrefix } from './types'

const { makeArray } = collections.array

const ERROR_MESSAGE_PREFIX = 'Received invalid adapter config input.'

export interface ObjectID {
  type: string
  instanceId: string
}
export type NetsuiteTypesQueryParams = Record<string, string[]>
export type NetsuiteFilePathsQueryParams = string[]
// deprecated
export type NetsuiteQueryParameters = {
  types?: NetsuiteTypesQueryParams
  filePaths?: NetsuiteFilePathsQueryParams
  customRecords?: NetsuiteTypesQueryParams
}

export type IdsQuery = {
  name: string
  ids?: string[]
}

export type CriteriaQuery = {
  name: string
  criteria: Values
}

export type FetchTypeQueryParams = IdsQuery | CriteriaQuery

export type QueryParams = {
  types: FetchTypeQueryParams[]
  fileCabinet: string[]
  customRecords?: FetchTypeQueryParams[]
}

export type LockedElementsConfig = {
  fetch: {
    lockedElementsToExclude?: QueryParams
  }
}

export type FieldToOmitParams = {
  type: string
  subtype?: string
  fields: string[]
}

export type FetchParams = {
  include: QueryParams
  exclude: QueryParams
  authorInformation?: {
    enable?: boolean
  }
  strictInstanceStructure?: boolean
  fieldsToOmit?: FieldToOmitParams[]
  addAlias?: boolean
  addBundles?: boolean
  addImportantValues?: boolean
} & LockedElementsConfig['fetch']

export const isCriteriaQuery = (
  type: FetchTypeQueryParams
): type is CriteriaQuery =>
  'criteria' in type

export const isIdsQuery = (
  type: FetchTypeQueryParams
): type is IdsQuery =>
  !isCriteriaQuery(type)

export const fullQueryParams = (): QueryParams => ({
  types: [{ name: '.*' }],
  fileCabinet: ['.*'],
  customRecords: [{ name: '.*' }],
})

export const emptyQueryParams = (): QueryParams => ({
  types: [],
  fileCabinet: [],
})

export const fullFetchConfig = (): FetchParams => ({
  include: fullQueryParams(),
  exclude: emptyQueryParams(),
})

export const FETCH_PARAMS: lowerdashTypes.TypeKeysEnum<FetchParams> = {
  include: 'include',
  exclude: 'exclude',
  lockedElementsToExclude: 'lockedElementsToExclude',
  authorInformation: 'authorInformation',
  strictInstanceStructure: 'strictInstanceStructure',
  fieldsToOmit: 'fieldsToOmit',
  addAlias: 'addAlias',
  addBundles: 'addBundles',
  addImportantValues: 'addImportantValues',
}

export const convertToQueryParams = ({
  types = {}, filePaths = [], customRecords = {},
}: NetsuiteQueryParameters): QueryParams => ({
  types: Object.entries(types).map(([name, ids]) => ({ name, ids })),
  fileCabinet: filePaths,
  customRecords: Object.entries(customRecords).map(([name, ids]) => ({ name, ids })),
})

export const getFixedTargetFetch = (
  query: NetsuiteQueryParameters | undefined
): NetsuiteQueryParameters | undefined => {
  if (query?.customRecords === undefined) {
    return query
  }
  const { types, filePaths, customRecords } = query
  // in case that custom records are fetched, we want to fetch their types too-
  // using this config: { types: { customrecordtype: [<customRecordTypes>] } }.
  // without that addition, the custom record types wouldn't be fetched
  // and we wouldn't be able to fetch the custom record instances.
  const customRecordTypeNames = Object.keys(customRecords)
  // custom record types that have custom segments are fetch by them
  // so we need to fetch the matching custom segments too.
  const customSegmentNames = customRecordTypeNames.map(removeCustomRecordTypePrefix).filter(name => name.length > 0)
  const customRecordTypesQuery = (types?.[CUSTOM_RECORD_TYPE] ?? []).concat(customRecordTypeNames)
  const customSegmentsQuery = (types?.[CUSTOM_SEGMENT] ?? []).concat(customSegmentNames)
  return {
    types: {
      ...types,
      [CUSTOM_RECORD_TYPE]: customRecordTypesQuery,
      [CUSTOM_SEGMENT]: customSegmentsQuery,
    },
    filePaths,
    customRecords,
  }
}

export type TypesQuery = {
  isTypeMatch: (typeName: string) => boolean
  areAllObjectsMatch: (typeName: string) => boolean
  isObjectMatch: (objectID: ObjectID) => boolean
}

export type FileCabinetQuery = {
  isFileMatch: (filePath: string) => boolean
  isParentFolderMatch: (folderPath: string) => boolean
  areSomeFilesMatch: () => boolean
}

export type CustomRecordsQuery = {
  isCustomRecordTypeMatch: (typeName: string) => boolean
  areAllCustomRecordsMatch: (typeName: string) => boolean
  isCustomRecordMatch: (objectID: ObjectID) => boolean
}

export type NetsuiteQuery = TypesQuery & FileCabinetQuery & CustomRecordsQuery

export type NetsuiteFetchQueries = {
  updatedFetchQuery: NetsuiteQuery
  originFetchQuery: NetsuiteQuery
}

export const checkTypeNameRegMatch = (type: FetchTypeQueryParams, str: string): boolean =>
  regex.isFullRegexMatch(str, type.name)

export const noSupportedTypeMatch = (name: string): boolean =>
  !netsuiteSupportedTypes
    .some(existTypeName => checkTypeNameRegMatch({ name }, existTypeName)
    // This is to support the adapter configuration before the migration of
    // the SuiteApp type names from PascalCase to camelCase
    || checkTypeNameRegMatch({ name },
      strings.capitalizeFirstLetter(existTypeName)))

const isInvalidTypeQuery = (obj: Record<string, unknown>): boolean =>
  typeof obj.name !== 'string' || (obj.ids !== undefined && obj.criteria !== undefined)
const isInvalidIdsParam = (obj: Record<string, unknown>): boolean =>
  obj.ids !== undefined && (!Array.isArray(obj.ids) || obj.ids.some((id: unknown) => typeof id !== 'string'))
const isInvalidCriteriaParam = (obj: Record<string, unknown>): boolean =>
  obj.criteria !== undefined && (!_.isPlainObject(obj.criteria) || _.isEmpty(obj.criteria))

export function validateFetchParameters(
  params: Partial<Record<keyof QueryParams, unknown>>
): asserts params is QueryParams {
  const { types, fileCabinet, customRecords = [] } = params
  if (!Array.isArray(types) || !Array.isArray(fileCabinet) || !Array.isArray(customRecords)) {
    const typesErr = !Array.isArray(types) ? ' "types" field is expected to be an array\n' : ''
    const fileCabinetErr = !Array.isArray(fileCabinet) ? ' "fileCabinet" field is expected to be an array\n' : ''
    const customRecordsErr = !Array.isArray(customRecords) ? ' "customRecords" field is expected to be an array\n' : ''
    const message = `${ERROR_MESSAGE_PREFIX}${typesErr}${fileCabinetErr}${customRecordsErr}`
    throw new Error(message)
  }
  const corruptedTypeQueries = types.filter(isInvalidTypeQuery)
  if (corruptedTypeQueries.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected the type name to be a string without both "ids" and "criteria", but found:\n${JSON.stringify(corruptedTypeQueries, null, 4)}.`)
  }
  const corruptedTypesIds = types.filter(isInvalidIdsParam)
  if (corruptedTypesIds.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected type "ids" to be an array of strings, but found:\n${JSON.stringify(corruptedTypesIds, null, 4)}}.`)
  }
  const corruptedTypesCriteria = types.filter(isInvalidCriteriaParam)
  if (corruptedTypesCriteria.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected type "criteria" to be a non-empty object, but found:\n${JSON.stringify(corruptedTypesCriteria, null, 4)}}.`)
  }
  const corruptedCustomRecords = customRecords.filter(isInvalidTypeQuery)
  if (corruptedCustomRecords.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected the custom record name to be a string without both "ids" and "criteria", but found:\n${JSON.stringify(corruptedCustomRecords, null, 4)}.`)
  }
  const corruptedCustomRecordsIds = customRecords.filter(isInvalidIdsParam)
  if (corruptedCustomRecordsIds.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected custom record "ids" to be an array of strings, but found:\n${JSON.stringify(corruptedCustomRecordsIds, null, 4)}}.`)
  }
  const corruptedCustomRecordsCriteria = customRecords.filter(isInvalidCriteriaParam)
  if (corruptedCustomRecordsCriteria.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected custom record "criteria" to be a non-empty object, but found:\n${JSON.stringify(corruptedCustomRecordsCriteria, null, 4)}}.`)
  }

  const receivedTypes = types.map(obj => obj.name)
  const receivedCustomRecords = customRecords.map(obj => obj.name)
  const idsRegexes = types.concat(customRecords)
    .map(obj => obj.ids)
    .flatMap(list => list ?? ['.*'])

  const invalidRegexes = idsRegexes
    .concat(fileCabinet)
    .concat(receivedTypes)
    .concat(receivedCustomRecords)
    .filter(reg => !regex.isValidRegex(reg))

  if (invalidRegexes.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} The following regular expressions are invalid:\n${invalidRegexes}.`)
  }

  const invalidTypes = receivedTypes.filter(noSupportedTypeMatch)

  if (invalidTypes.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} The following types or regular expressions do not match any supported type:\n${invalidTypes}.`)
  }
}

export const validateFieldsToOmitConfig = (fieldsToOmitConfig: unknown): void => {
  if (!Array.isArray(fieldsToOmitConfig)) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} "${FETCH_PARAMS.fieldsToOmit}" field is expected to be an array`)
  }
  const corruptedTypes = fieldsToOmitConfig.filter(obj => typeof obj.type !== 'string')
  if (corruptedTypes.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected "type" field to be a string, but found:\n${JSON.stringify(corruptedTypes, null, 4)}.`)
  }
  const corruptedSubtypes = fieldsToOmitConfig.filter(obj => obj.subtype !== undefined && typeof obj.subtype !== 'string')
  if (corruptedSubtypes.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected "subtype" field to be a string, but found:\n${JSON.stringify(corruptedSubtypes, null, 4)}.`)
  }
  const corruptedFields = fieldsToOmitConfig.filter(
    obj => !Array.isArray(obj.fields)
    || obj.fields.length === 0
    || obj.fields.some((item: unknown) => typeof item !== 'string')
  )
  if (corruptedFields.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} Expected "fields" field to be an array of strings, but found:\n${JSON.stringify(corruptedFields, null, 4)}.`)
  }
  const invalidRegexes = fieldsToOmitConfig
    .flatMap(obj => [obj.type, ...(obj.subtype ? [obj.subtype] : []), ...obj.fields])
    .filter(reg => !regex.isValidRegex(reg))
  if (invalidRegexes.length !== 0) {
    throw new Error(`${ERROR_MESSAGE_PREFIX} The following regular expressions are invalid:\n${JSON.stringify(invalidRegexes, null, 4)}.`)
  }
}

const buildTypesQuery = (types: FetchTypeQueryParams[]): TypesQuery => {
  const matchingTypes = (typeName: string): FetchTypeQueryParams[] =>
    types.filter(type => checkTypeNameRegMatch(type, typeName))

  const matchingTypesRegexes = (typeName: string): string[] =>
    matchingTypes(typeName)
      .filter(isIdsQuery)
      .flatMap(type => type.ids ?? ['.*'])

  return {
    isTypeMatch: typeName =>
      matchingTypes(typeName).length > 0,
    areAllObjectsMatch: typeName =>
      matchingTypesRegexes(typeName).some(id => id === '.*'),
    isObjectMatch: ({ type, instanceId }) =>
      matchingTypesRegexes(type).some(reg => new RegExp(`^${reg}$`).test(instanceId)),
  }
}

const buildFileCabinetQuery = (fileMatchers: string[]): FileCabinetQuery => {
  const parentFolderMatchers = fileMatchers.flatMap(
    matcher => _.range(matcher.length)
      .map(i => matcher.slice(0, i + 1))
      .filter(regex.isValidRegex)
      .map(reg => new RegExp(`^${reg}$`))
  )
  return {
    isFileMatch: filePath =>
      fileMatchers.some(reg => new RegExp(`^${reg}$`).test(filePath)),
    isParentFolderMatch: folderPath =>
      parentFolderMatchers.some(matcher => matcher.test(folderPath)),
    areSomeFilesMatch: () => fileMatchers.length !== 0,
  }
}

export const buildNetsuiteQuery = (
  { types = [], fileCabinet = [], customRecords = [] }: Partial<QueryParams>
): NetsuiteQuery => {
  // This is to support the adapter configuration before the migration of
  // the SuiteApp type names from PascalCase to camelCase
  const fixedTypes = types.map(type => ({
    ...type,
    name: strings.lowerCaseFirstLetter(type.name) in TYPES_TO_INTERNAL_ID
      ? strings.lowerCaseFirstLetter(type.name)
      : type.name,
  }))

  const {
    isTypeMatch,
    areAllObjectsMatch,
    isObjectMatch,
  } = buildTypesQuery(fixedTypes)
  const {
    isFileMatch,
    isParentFolderMatch,
    areSomeFilesMatch,
  } = buildFileCabinetQuery(fileCabinet)
  const {
    isTypeMatch: isCustomRecordTypeMatch,
    areAllObjectsMatch: areAllCustomRecordsMatch,
    isObjectMatch: isCustomRecordMatch,
  } = buildTypesQuery(customRecords)

  return {
    isTypeMatch,
    areAllObjectsMatch,
    isObjectMatch,
    isFileMatch,
    isParentFolderMatch,
    areSomeFilesMatch,
    isCustomRecordTypeMatch,
    areAllCustomRecordsMatch,
    isCustomRecordMatch,
  }
}

export const andQuery = (firstQuery: NetsuiteQuery, secondQuery: NetsuiteQuery): NetsuiteQuery => ({
  isTypeMatch: typeName =>
    firstQuery.isTypeMatch(typeName) && secondQuery.isTypeMatch(typeName),
  areAllObjectsMatch: typeName =>
    firstQuery.areAllObjectsMatch(typeName) && secondQuery.areAllObjectsMatch(typeName),
  isObjectMatch: objectID =>
    firstQuery.isObjectMatch(objectID) && secondQuery.isObjectMatch(objectID),
  isFileMatch: filePath =>
    firstQuery.isFileMatch(filePath) && secondQuery.isFileMatch(filePath),
  isParentFolderMatch: folderPath =>
    firstQuery.isParentFolderMatch(folderPath) && secondQuery.isParentFolderMatch(folderPath),
  areSomeFilesMatch: () =>
    firstQuery.areSomeFilesMatch() && secondQuery.areSomeFilesMatch(),
  isCustomRecordTypeMatch: typeName =>
    firstQuery.isCustomRecordTypeMatch(typeName) && secondQuery.isCustomRecordTypeMatch(typeName),
  areAllCustomRecordsMatch: typeName =>
    firstQuery.areAllCustomRecordsMatch(typeName) && secondQuery.areAllCustomRecordsMatch(typeName),
  isCustomRecordMatch: objectID =>
    firstQuery.isCustomRecordMatch(objectID) && secondQuery.isCustomRecordMatch(objectID),
})

export const notQuery = (query: NetsuiteQuery): NetsuiteQuery => ({
  isTypeMatch: typeName => !query.areAllObjectsMatch(typeName),
  areAllObjectsMatch: typeName => !query.isTypeMatch(typeName),
  isObjectMatch: objectID => !query.isObjectMatch(objectID),
  isFileMatch: filePath => !query.isFileMatch(filePath),
  isParentFolderMatch: () => true,
  areSomeFilesMatch: () => true,
  isCustomRecordTypeMatch: typeName => !query.areAllCustomRecordsMatch(typeName),
  areAllCustomRecordsMatch: typeName => !query.isCustomRecordTypeMatch(typeName),
  isCustomRecordMatch: objectID => !query.isCustomRecordMatch(objectID),
})

export function validateArrayOfStrings(
  value: unknown,
  configPath: string | string[]
): asserts value is string[] {
  if (!_.isArray(value) || !value.every(_.isString)) {
    throw new Error(`${makeArray(configPath).join('.')} should be a list of strings`)
  }
}

export function validatePlainObject(
  value: NonNullable<unknown> | null,
  configPath: string | string[]
): asserts value is Record<string, unknown> {
  if (!_.isPlainObject(value)) {
    throw new Error(`${makeArray(configPath).join('.')} should be an object`)
  }
}

export function validateDefined(
  value: unknown,
  configPath: string | string[]
): asserts value is NonNullable<unknown> | null {
  if (value === undefined) {
    throw new Error(`${makeArray(configPath).join('.')} should be defined`)
  }
}

const netsuiteQueryParamsKeys: lowerdashTypes.TypeKeysEnum<NetsuiteQueryParameters> = {
  types: 'types',
  filePaths: 'filePaths',
  customRecords: 'customRecords',
}
export function validateNetsuiteQueryParameters(
  values: Record<string, unknown>,
  configName: string
): asserts values is NetsuiteQueryParameters {
  const { types, filePaths, customRecords } = _.pick(values, Object.values(netsuiteQueryParamsKeys))
  if (filePaths !== undefined) {
    validateArrayOfStrings(filePaths, [configName, netsuiteQueryParamsKeys.filePaths])
  }
  if (types !== undefined) {
    validatePlainObject(types, [configName, netsuiteQueryParamsKeys.types])
    Object.entries(types).forEach(([key, value]) => {
      validateArrayOfStrings(value, [configName, netsuiteQueryParamsKeys.types, key])
    })
  }
  if (customRecords !== undefined) {
    validatePlainObject(customRecords, [configName, netsuiteQueryParamsKeys.customRecords])
    Object.entries(customRecords).forEach(([key, value]) => {
      validateArrayOfStrings(value, [configName, netsuiteQueryParamsKeys.customRecords, key])
    })
  }
}
