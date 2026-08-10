<script setup lang="ts"></script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-12">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <span class="text-lg font-semibold tracking-tight text-surface-900">Timesheets</span>
      </div>
      <div class="rounded-lg border border-surface-200 bg-white p-6 shadow-sm">
        <slot />
      </div>
    </div>
  </div>
</template>
