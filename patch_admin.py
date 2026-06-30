with open('frontend/src/pages/AdminPage.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'const [activities, setActivities] = useState([])' in line:
        continue
    if '    const fetchActivities = async () => {' in line:
        skip = True
    if skip and '    const fetchRequests = async () => {' in line:
        skip = False
    if skip:
        continue

    if '<button ' in line and i+1 < len(lines) and 'onClick={() => setActiveTab(\'activity\')}' in lines[i+1]:
        skip = True
    if skip and '</button>' in line and i-10 >= 0 and 'Activity Feed' in lines[i-1]:
        skip = False
        continue
    
    if '{/* Activity Feed Tab */}' in line:
        skip = True
    if skip and '{/* Masked Keywords Tab */}' in line:
        skip = False

    if not skip:
        new_lines.append(line)

content = ''.join(new_lines)
content = content.replace('// requests | users | matrix | activity', '// requests | users | matrix | keywords')
content = content.replace('        } else if (activeTab === \'activity\') {\n            fetchActivities()\n', '')

with open('frontend/src/pages/AdminPage.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done modifying AdminPage.jsx')
