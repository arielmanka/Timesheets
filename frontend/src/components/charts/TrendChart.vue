<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Legend,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js'
import { useAuthStore } from '../../stores/auth'
import { cssToken as token } from '../../utils/chartColors'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Legend, Tooltip)

const props = defineProps<{
  title: string
  buckets: string[]
  granularity: 'day' | 'week' | 'month'
  series: Array<{ id: string; name: string; color: string; data: number[] }>
  /** Drives axis/tooltip number formatting. */
  valueFormat: 'hours' | 'count' | { currency: string }
}>()

const auth = useAuthStore()

function formatValue(n: number): string {
  if (props.valueFormat === 'hours') return `${n.toFixed(1)}h`
  if (props.valueFormat === 'count') return n.toFixed(0)
  const locale = auth.user?.locale || navigator.language || 'en-US'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: props.valueFormat.currency }).format(n)
  } catch {
    return `${props.valueFormat.currency} ${n.toFixed(2)}`
  }
}

function formatBucketLabel(bucket: string): string {
  const d = new Date(`${bucket}T00:00:00Z`)
  if (props.granularity === 'month') {
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return props.granularity === 'week' ? `Week of ${label}` : label
}

const chartData = computed(() => ({
  labels: props.buckets.map(formatBucketLabel),
  datasets: props.series.map((s) => ({
    label: s.name,
    data: s.data,
    borderColor: s.color,
    backgroundColor: s.color,
    pointBackgroundColor: s.color,
    pointBorderColor: token('--color-surface-50', '#fcfcfb'),
    pointBorderWidth: 2,
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    // Monotone cubic interpolation curves the line without overshooting past
    // a bucket's real value (plain bezier tension can dip a curve below zero
    // or above a peak between points, which would misrepresent the data).
    cubicInterpolationMode: 'monotone' as const,
  })),
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      display: props.series.length > 1,
      position: 'top',
      align: 'start',
      labels: {
        usePointStyle: true,
        pointStyle: 'line',
        color: token('--color-surface-600', '#54545c'),
        font: { size: 12 },
      },
    },
    tooltip: {
      backgroundColor: token('--color-surface-900', '#1e1e24'),
      titleColor: token('--color-surface-50', '#fcfcfb'),
      bodyColor: token('--color-surface-50', '#fcfcfb'),
      callbacks: {
        label: (item: TooltipItem<'line'>) => `${item.dataset.label}: ${formatValue(item.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: token('--color-surface-500', '#6f6f77'), font: { size: 11 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: token('--color-surface-200', '#e5e5ea') },
      ticks: {
        color: token('--color-surface-500', '#6f6f77'),
        font: { size: 11 },
        callback: (value) => formatValue(Number(value)),
      },
    },
  },
}))
</script>

<template>
  <div class="rounded-lg border border-surface-200 bg-white p-4">
    <h3 class="mb-3 text-sm font-semibold text-surface-800">{{ title }}</h3>
    <div class="h-64">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
