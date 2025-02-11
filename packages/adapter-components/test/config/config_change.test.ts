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

import { InstanceElement, ElemID, ObjectType } from '@salto-io/adapter-api'
import { createAdapterApiConfigType, createTransformationConfigTypes, getUpdatedCofigFromConfigChanges } from '../../src/config'

describe('config_change', () => {
  let config: InstanceElement
  const transformationTypes = createTransformationConfigTypes({ adapter: 'test' })
  const configType = createAdapterApiConfigType({ adapter: 'test', transformationTypes })
  beforeEach(() => {
    config = new InstanceElement(
      ElemID.CONFIG_NAME,
      new ObjectType({ elemID: new ElemID('test', ElemID.CONFIG_NAME) }),
      {
        fetch: {
          include: [
            { type: 'aType' },
          ],
          exclude: [
            { type: 'Type1' },
          ],
        },
      }
    )
  })
  it('should return undefined when no changes are suggested', () => {
    expect(getUpdatedCofigFromConfigChanges({ configChanges: [], currentConfig: config, configType })).toBeUndefined()
  })
  it('should return new config when changes are suggested and a message', () => {
    const configChange = getUpdatedCofigFromConfigChanges({
      configChanges: [
        { type: 'typeToExclude', value: 'bType', reason: 'r1' },
        { type: 'typeToExclude', value: 'cType', reason: 'r2' },
        { type: 'disablePrivateAPI', reason: 'can not fetch private api' },
      ],
      currentConfig: config,
      configType,
    })
    expect(configChange?.config).toHaveLength(1)
    expect(configChange?.config[0].value.fetch.include).toEqual([{ type: 'aType' }])
    expect(configChange?.config[0].value.fetch.exclude).toEqual([{ type: 'Type1' }, { type: 'bType' }, { type: 'cType' }])
    expect(configChange?.config[0].value.client).toEqual({ usePrivateAPI: false })
    expect(configChange?.message).toContain('r1')
    expect(configChange?.message).toContain('r2')
    expect(configChange?.message).toContain('can not fetch private api')
  })
})
