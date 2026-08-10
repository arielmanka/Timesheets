import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as timeRecordsService from '../services/timeRecords.service'
import type { TimeRecord, TimeRecordInput, TimeRecordUpdateInput, ListTimeRecordsFilter } from '../types/timeRecord'

export const useTimeRecordsStore = defineStore('timeRecords', () => {
  const items = ref<TimeRecord[]>([])
  const loaded = ref(false)

  async function fetchAll(teamId: string, filter: ListTimeRecordsFilter = {}): Promise<void> {
    items.value = await timeRecordsService.listTimeRecords(teamId, filter)
    loaded.value = true
  }

  async function create(teamId: string, input: TimeRecordInput): Promise<TimeRecord> {
    const record = await timeRecordsService.createTimeRecord(teamId, input)
    items.value.unshift(record)
    return record
  }

  async function update(teamId: string, recordId: string, input: TimeRecordUpdateInput): Promise<TimeRecord> {
    const record = await timeRecordsService.updateTimeRecord(teamId, recordId, input)
    replace(record)
    return record
  }

  async function remove(teamId: string, recordId: string): Promise<void> {
    await timeRecordsService.deleteTimeRecord(teamId, recordId)
    items.value = items.value.filter((r) => r._id !== recordId)
  }

  async function approve(teamId: string, recordId: string): Promise<TimeRecord> {
    const record = await timeRecordsService.approveTimeRecord(teamId, recordId)
    replace(record)
    return record
  }

  async function reject(teamId: string, recordId: string, reason: string): Promise<TimeRecord> {
    const record = await timeRecordsService.rejectTimeRecord(teamId, recordId, reason)
    replace(record)
    return record
  }

  function replace(record: TimeRecord): void {
    const index = items.value.findIndex((r) => r._id === record._id)
    if (index !== -1) items.value[index] = record
    else items.value.unshift(record)
  }

  function reset(): void {
    items.value = []
    loaded.value = false
  }

  return { items, loaded, fetchAll, create, update, remove, approve, reject, reset }
})
