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

import { ElemID, Values, Element } from '@salto-io/adapter-api'
import { createReference } from '../../../utils'
import { JIRA } from '../../../../src/constants'

export const createObjectTypeAttributeValues = (name: string, allElements: Element[]): Values => ({
  name,
  objectType: createReference(new ElemID(JIRA, 'ObjectType', 'instance', 'testSchema_Hardware_Assets@us'), allElements),
  label: false,
  type: 0,
  editable: true,
  sortable: true,
  summable: false,
  indexed: true,
  minimumCardinality: 0,
  maximumCardinality: 1,
  removable: true,
  hidden: false,
  includeChildObjectTypes: false,
  uniqueAttribute: false,
  options: '',
  defaultTypeId: 0,
})
