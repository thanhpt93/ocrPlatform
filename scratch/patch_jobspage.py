path = 'C:/project/ocrPlatform/src/modules/customer/jobs/JobsPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update customerJobs
old_1 = """  const customerJobs = jobs.filter((j) => j.customerId === effectiveCustomerId);"""
new_1 = """  const customerJobs = jobs
    .map((j) => (j.status === 'processing' && j.extractedDataPreview ? { ...j, status: 'completed' as const } : j))
    .filter((j) => j.customerId === effectiveCustomerId);"""

assert old_1 in content, "old_1 not found"
content = content.replace(old_1, new_1)

# 2. Update submitNewJob call to include id: res.job_id and status: 'completed'
old_2 = """        submitNewJob({
          customerId: customer.id,
          customerName: customer.orgName,
          fileName: selectedFile.name,"""

new_2 = """        submitNewJob({
          id: res.job_id || `JOB-${Date.now().toString().slice(-6)}`,
          customerId: customer.id,
          customerName: customer.orgName,
          fileName: selectedFile.name,"""

assert old_2 in content, "old_2 not found"
content = content.replace(old_2, new_2)

old_3 = """          confidenceScore: res.confidence_score || 99.2,
          extractedDataPreview: res.extracted_data,
        });"""

new_3 = """          confidenceScore: res.confidence_score || 99.2,
          extractedDataPreview: res.extracted_data,
          status: 'completed',
        });"""

assert old_3 in content, "old_3 not found"
content = content.replace(old_3, new_3)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("JobsPage updated successfully")
