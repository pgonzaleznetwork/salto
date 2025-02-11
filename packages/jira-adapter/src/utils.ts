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
import { CORE_ANNOTATIONS, ObjectType, Element, isObjectType, getDeepInnerType, InstanceElement, ReadOnlyElementsSource, isInstanceElement, Value } from '@salto-io/adapter-api'
import { logger } from '@salto-io/logging'
import { elements as elementUtils } from '@salto-io/adapter-components'
import { collections } from '@salto-io/lowerdash'
import { getParent } from '@salto-io/adapter-utils'
import { JiraConfig, JspUrls } from './config/config'
import { ACCOUNT_INFO_ELEM_ID, JIRA_FREE_PLAN } from './constants'

type appInfo = {
  id: string
  plan: string
}

const log = logger(module)
const { awu } = collections.asynciterable

export const setFieldDeploymentAnnotations = (type: ObjectType, fieldName: string): void => {
  if (type.fields[fieldName] !== undefined) {
    type.fields[fieldName].annotations[CORE_ANNOTATIONS.CREATABLE] = true
    type.fields[fieldName].annotations[CORE_ANNOTATIONS.UPDATABLE] = true
  }
}

export const setTypeDeploymentAnnotations = (type: ObjectType): void => {
  type.annotations[CORE_ANNOTATIONS.CREATABLE] = true
  type.annotations[CORE_ANNOTATIONS.UPDATABLE] = true
  type.annotations[CORE_ANNOTATIONS.DELETABLE] = true
}

export const findObject = (elements: Element[], name: string): ObjectType | undefined => {
  const type = elements.filter(isObjectType).find(
    element => element.elemID.name === name
  )

  if (type === undefined) {
    log.warn(`${name} type not found`)
    return undefined
  }
  return type
}


export const addAnnotationRecursively = async (
  type: ObjectType,
  annotation: string
): Promise<void> =>
  awu(Object.values(type.fields)).forEach(async field => {
    if (!field.annotations[annotation]) {
      field.annotations[annotation] = true
      const fieldType = await getDeepInnerType(await field.getType())
      if (isObjectType(fieldType)) {
        await addAnnotationRecursively(fieldType, annotation)
      }
    }
  })

export const getFilledJspUrls = (
  instance: InstanceElement,
  config: JiraConfig,
  typeName: string
): JspUrls => {
  const jspRequests = config.apiDefinitions.types[typeName]?.jspRequests
  if (jspRequests === undefined) {
    throw new Error(`${typeName} jsp urls are missing from the configuration`)
  }

  return {
    ...jspRequests,
    query: jspRequests.query && elementUtils.createUrl({
      instance,
      baseUrl: jspRequests.query,
    }),
  }
}

export const isAllFreeLicense = async (
  elementsSource: ReadOnlyElementsSource
): Promise<boolean> => {
  if (!await elementsSource.has(ACCOUNT_INFO_ELEM_ID)) {
    log.error('account info instance not found in elements source, treating the account as paid one')
    return false
  }
  const accountInfo = await elementsSource.get(ACCOUNT_INFO_ELEM_ID)
  if (!isInstanceElement(accountInfo)
  || accountInfo.value.license?.applications === undefined) {
    log.error('account info instance or its license not found in elements source, treating the account as paid one')
    return false
  }
  const hasPaidApp = accountInfo.value.license.applications.some((app: appInfo) => app.plan !== 'FREE')
  return !hasPaidApp
}

export const isJiraSoftwareFreeLicense = async (
  elementsSource: ReadOnlyElementsSource
): Promise<boolean> => {
  if (!await elementsSource.has(ACCOUNT_INFO_ELEM_ID)) {
    return true
  }
  const accountInfo = await elementsSource.get(ACCOUNT_INFO_ELEM_ID)
  if (!isInstanceElement(accountInfo)
  || accountInfo.value.license?.applications === undefined) {
    log.error('account info instance or its license not found in elements source, treating the account as free one')
    return true
  }
  const mainApplication = accountInfo.value.license.applications.find((app: Value) => app.id === 'jira-software')
  if (mainApplication?.plan === undefined) {
    log.warn('could not find license of jira-software, treating the account as free one')
    return true
  }
  return mainApplication.plan === JIRA_FREE_PLAN
}

export const renameKey = (object: Value, { from, to }: { from: string; to: string }): void => {
  if (object[from] !== undefined) {
    object[to] = object[from]
    delete object[from]
  }
}

export const isThereValidParent = (element: Element): boolean => {
  try {
    return getParent(element) !== undefined
  } catch {
    return false
  }
}
