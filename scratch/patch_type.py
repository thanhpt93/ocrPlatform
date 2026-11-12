path = 'C:/project/ocrPlatform/src/stores/usePlatformStore.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_str = "submitNewJob: (job: Omit<OCRJob, 'id' | 'submissionTime' | 'status'>) => void;"
new_str = "submitNewJob: (job: Omit<OCRJob, 'id' | 'submissionTime' | 'status'> & Partial<Pick<OCRJob, 'id' | 'submissionTime' | 'status'>>) => void;"

assert old_str in content, "old_str not found"
content = content.replace(old_str, new_str)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("submitNewJob type updated successfully")
