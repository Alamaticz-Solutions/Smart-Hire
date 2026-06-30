import os

filepath = r"frontend\src\pages\JobsPage.jsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

target = """                                                                                      try {
                                                                                          await axios.put(`${API_URL}/api/candidates/${row.id}`, { candidate_status: newVal });
                                                                                          setCandidates(prev => prev.map((r, i) => i === ri ? { ...r, candidate_status: newVal } : r));
                                                                                          showToast('Saved!');
                                                                                      } catch (err) {"""

replacement = """                                                                                      try {
                                                                                          // 1. Update candidate profile status
                                                                                          await axios.put(`${API_URL}/api/candidates/${row.id}`, { candidate_status: newVal });
                                                                                          
                                                                                          // 2. Auto-sync: Update job candidate mapping status
                                                                                          const newJobStatus = newVal.toLowerCase() === 'selected' ? 'selected' : 'matched';
                                                                                          await axios.put(`${API_URL}/api/jobs/${selectedJob.id}/candidates/${row.id}`, { status: newJobStatus });
                                                                                          
                                                                                          // 3. Update local state
                                                                                          setCandidates(prev => prev.map((r, i) => i === ri ? { ...r, candidate_status: newVal, job_status: newJobStatus } : r));
                                                                                          loadJobs(); // Refresh job counts in sidebar
                                                                                          showToast('Saved and synced tab!');
                                                                                      } catch (err) {"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    print("SUCCESS")
else:
    # Try with LF line endings
    target_lf = target.replace("\r\n", "\n")
    replacement_lf = replacement.replace("\r\n", "\n")
    content_lf = content.replace("\r\n", "\n")
    if target_lf in content_lf:
        content_lf = content_lf.replace(target_lf, replacement_lf)
        with open(filepath, "w", encoding="utf-8", newline="") as f:
            f.write(content_lf)
        print("SUCCESS LF")
    else:
        print("TARGET NOT FOUND")
