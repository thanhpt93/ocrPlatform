path = 'C:/project/ocrPlatform/src/stores/usePlatformStore.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add sanitizeJobs helper before usePlatformStore
old_1 = """const saved = loadStoredState();
const initialUser = api.getCurrentUser();
const isRealCustomer = Boolean(initialUser && initialUser.id && !initialUser.id.startsWith('cust-'));

export const usePlatformStore = create<PlatformState>((set, get) => ({"""

new_1 = """const saved = loadStoredState();
const initialUser = api.getCurrentUser();
const isRealCustomer = Boolean(initialUser && initialUser.id && !initialUser.id.startsWith('cust-'));

const sanitizeJobs = (jobsList: any[]) => {
  if (!Array.isArray(jobsList)) return [];
  return jobsList.map((j) => {
    if (j && j.status === 'processing' && j.extractedDataPreview) {
      return { ...j, status: 'completed' };
    }
    return j;
  });
};

export const usePlatformStore = create<PlatformState>((set, get) => ({"""

assert old_1 in content, "old_1 not found"
content = content.replace(old_1, new_1)

# 2. Wrap initial jobs with sanitizeJobs
old_2 = """jobs: isRealCustomer ? (saved?.jobs?.filter((j: any) => j.customerId === initialUser.id) || []) : (saved?.jobs || initialJobs),"""
new_2 = """jobs: isRealCustomer ? sanitizeJobs(saved?.jobs?.filter((j: any) => j.customerId === initialUser.id) || []) : sanitizeJobs(saved?.jobs || initialJobs),"""

assert old_2 in content, "old_2 not found"
content = content.replace(old_2, new_2)

# 3. Update syncWithBackend to sanitize userJobs
old_3 = """      const userJobs = curUser ? get().jobs.filter((j) => j.customerId === curUser.id) : get().jobs;"""
new_3 = """      const rawUserJobs = curUser ? get().jobs.filter((j) => j.customerId === curUser.id) : get().jobs;
      const userJobs = rawUserJobs.map((j) => {
        if (j.status === 'processing' && j.extractedDataPreview) {
          return { ...j, status: 'completed' as const };
        }
        return j;
      });"""

assert old_3 in content, "old_3 not found"
content = content.replace(old_3, new_3)

# 4. Update submitNewJob to set status: 'completed'
old_4 = """  submitNewJob: (job) => {
    const newJob: OCRJob = {
      ...job,
      id: `JOB-${Date.now().toString().slice(-6)}`,
      submissionTime: new Date().toLocaleString(),
      status: 'processing',
    };
    set((state) => {
      const next = { jobs: [newJob, ...state.jobs] };
      persist({ ...state, ...next });
      return next;
    });
  },"""

new_4 = """  submitNewJob: (job) => {
    const now = new Date();
    const newJob: OCRJob = {
      id: job.id || `JOB-${Date.now().toString().slice(-6)}`,
      submissionTime: job.submissionTime || now.toLocaleString(),
      completionTime: job.status === 'completed' || !job.status ? now.toLocaleString() : undefined,
      ...job,
      status: job.status || 'completed',
    };
    set((state) => {
      const updatedExisting = state.jobs.map((j) => {
        if (j.status === 'processing' && j.extractedDataPreview) {
          return { ...j, status: 'completed' as const };
        }
        return j;
      });
      const next = { jobs: [newJob, ...updatedExisting] };
      persist({ ...state, ...next });
      return next;
    });
  },"""

assert old_4 in content, "old_4 not found"
content = content.replace(old_4, new_4)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("usePlatformStore updated successfully")
