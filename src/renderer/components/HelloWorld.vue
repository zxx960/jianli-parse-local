<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  msg: String,
})

const importing = ref(false)
const extracting = ref(false)
const resumeError = ref('')
const resumeItems = ref<Array<{
  filePath: string
  result: { name?: string | null; gender?: string | null; age?: number | null; education?: string | null; phone?: string | null; email?: string | null }
}>>([])

onMounted(() => {
  if (window.electronAPI?.onResumeItemParsed) {
    window.electronAPI.onResumeItemParsed((item: any) => {
      if (item && item.filePath) {
        const index = resumeItems.value.findIndex(x => x.filePath === item.filePath)
        if (index !== -1) {
          resumeItems.value[index].result = item.result || {}
        } else {
          resumeItems.value.push({
            filePath: item.filePath,
            result: item.result || {},
          })
        }
      }
    })
  }
})

onBeforeUnmount(() => {
  if (window.electronAPI?.removeAllResumeItemParsedListeners) {
    window.electronAPI.removeAllResumeItemParsedListeners()
  }
})

async function importResumes() {
  if (!window.electronAPI?.selectResumeFiles) {
    resumeError.value = '简历导入接口未就绪，请检查主进程和 preload 配置。'
    return
  }

  resumeError.value = ''
  resumeItems.value = []
  importing.value = true
  try {
    const res = await window.electronAPI.selectResumeFiles()
    if (res.canceled) {
      return
    }

    let filePaths = Array.isArray(res.filePaths) ? res.filePaths : []

    if (filePaths.length > 10) {
      resumeError.value = '一次最多导入 10 份简历，请重新选择。'
      return
    }

    resumeItems.value = filePaths.map((filePath: string) => ({
      filePath,
      result: {},
    }))
  } catch (e: any) {
    resumeError.value = e?.message || String(e)
  } finally {
    importing.value = false
  }
}

async function parseResume() {
  if (!window.electronAPI?.parseResumePdf) {
    resumeError.value = '简历解析接口未就绪，请检查主进程和 preload 配置。'
    return
  }

  resumeError.value = ''
  if (!resumeItems.value.length) {
    resumeError.value = '请先导入要解析的简历文件。'
    return
  }

  // 清空旧的解析结果，但保留文件列表
  resumeItems.value = resumeItems.value.map(item => ({
    filePath: item.filePath,
    result: {},
  }))

  extracting.value = true
  try {
    const filePaths = resumeItems.value.map(item => item.filePath)
    const res = await window.electronAPI.parseResumePdf(filePaths)
    if (res.canceled) {
      return
    }
  } catch (e: any) {
    resumeError.value = e?.message || String(e)
  } finally {
    extracting.value = false
  }
}

async function exportToExcel() {
  if (!resumeItems.value.length) {
    resumeError.value = '当前没有可导出的数据，请先导入并提取简历。'
    return
  }

  if (!window.electronAPI?.exportResumeExcel) {
    resumeError.value = '导出接口未就绪，请检查主进程和 preload 配置。'
    return
  }

  resumeError.value = ''
  try {
    const payload = resumeItems.value.map((item) => ({
      filePath: String(item.filePath),
      result: {
        name: item.result?.name ?? null,
        gender: item.result?.gender ?? null,
        age: item.result?.age ?? null,
        education: item.result?.education ?? null,
        phone: item.result?.phone ?? null,
        email: item.result?.email ?? null,
      },
    }))
    await window.electronAPI.exportResumeExcel(payload)
  } catch (e: any) {
    resumeError.value = e?.message || String(e)
  }
}

function clearResumes() {
  resumeItems.value = []
  resumeError.value = ''
}
</script>

<template>
  <h1>{{ msg }}</h1>

  <hr />

  <div class="resume-demo">
    <button type="button" @click="importResumes" :disabled="importing || extracting">
      {{ importing ? '正在导入简历...' : '导入简历 PDF' }}
    </button>

    <button
      type="button"
      @click="parseResume"
      :disabled="extracting || importing || !resumeItems.length"
    >
      {{ extracting ? '正在提取...' : '开始提取' }}
    </button>

    <button
      type="button"
      @click="exportToExcel"
      :disabled="!resumeItems.length"
    >
      导出为 Excel
    </button>

    <button
      type="button"
      @click="clearResumes"
      :disabled="!resumeItems.length"
    >
      清空
    </button>

    <p v-if="resumeError" class="error">{{ resumeError }}</p>

    <div v-if="resumeItems.length" class="resume-table-wrapper" style="max-height: 400px; overflow-y: auto;">
      <table class="resume-table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>姓名</th>
            <th>性别</th>
            <th>年龄</th>
            <th>学历</th>
            <th>手机</th>
            <th>邮箱</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in resumeItems" :key="item.filePath">
            <td>{{ index + 1 }}. {{ item.filePath.split('\\').pop() }}</td>
            <td>{{ item.result?.name ?? '—' }}</td>
            <td>{{ item.result?.gender ?? '—' }}</td>
            <td>{{ item.result?.age ?? '—' }}</td>
            <td>{{ item.result?.education ?? '—' }}</td>
            <td>{{ item.result?.phone ?? '—' }}</td>
            <td>{{ item.result?.email ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="page-footer">
    作者：西牧，微信：zxx960
  </div>

</template>

<style scoped>

.answer {
  padding: 0.75rem;
  background: #1e1e1e;
  color: #f5f5f5;
  border-radius: 4px;
  max-height: 300px;
  overflow: auto;
}

.error {
  color: #ff4d4f;
}

.resume-demo {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.resume-table-wrapper {
  max-height: 400px;
  overflow-y: auto;
}

.resume-table {
  width: 100%;
  border-collapse: collapse;
}

.resume-table th,
.resume-table td {
  border: 1px solid #444;
  padding: 0.5rem;
}

.resume-path {
  font-size: 0.875rem;
  color: #aaa;
}

.page-footer {
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: #aaa;
  text-align: center;
}
</style>
