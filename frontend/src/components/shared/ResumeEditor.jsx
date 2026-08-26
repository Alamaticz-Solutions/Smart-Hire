import { Trash2, Plus } from 'lucide-react'

/**
 * Form-based editor for the "formatted" (Alamaticz-format) resume data
 * structure — personal details, profile summary, skills, certifications,
 * education, work experience, and recognitions. Fully controlled: reads
 * `formData` and reports every change back via `setFormData` (a React
 * state setter, called with an updater function).
 *
 * Extracted from: JobsPage.jsx (`ResumeEditor`, ~line 120). This was only
 * ever defined/used inside JobsPage.jsx — grepping the rest of
 * `frontend/src` confirmed UploadPage.jsx and DashboardPage.jsx have no
 * resume-editing UI of their own; both only ever *view* the formatted
 * resume (UploadPage dumps raw `formatted_html`/JSON, DashboardPage never
 * actually renders its fetched data — see CandidateDetailsModal.jsx for
 * details). So there was nothing to reconcile here; this is a direct,
 * unmodified extraction. The merged `CandidateDetailsModal` decides
 * whether to mount this (editable case) or the read-only `ResumePreview`
 * component based on its `editable` prop.
 */
export default function ResumeEditor({ formData, setFormData }) {
    if (!formData) return null;

    const handleUpdateField = (field, val) => {
        setFormData(prev => ({
            ...prev,
            [field]: val
        }));
    };

    const handleUpdateTechnicalSkill = (field, val) => {
        setFormData(prev => ({
            ...prev,
            technical_skills: {
                ...(prev.technical_skills || {}),
                [field]: val
            }
        }));
    };

    // Education helpers
    const handleAddEducation = () => {
        setFormData(prev => ({
            ...prev,
            education: [...(prev.education || []), { degree: '', field: '', school: '', years: '' }]
        }));
    };

    const handleRemoveEducation = (index) => {
        setFormData(prev => ({
            ...prev,
            education: (prev.education || []).filter((_, i) => i !== index)
        }));
    };

    const handleUpdateEducation = (index, field, val) => {
        setFormData(prev => {
            const arr = [...(prev.education || [])];
            arr[index] = { ...arr[index], [field]: val };
            return { ...prev, education: arr };
        });
    };

    // Work Experience helpers
    const handleAddWorkExp = () => {
        setFormData(prev => ({
            ...prev,
            work_experience: [...(prev.work_experience || []), { company: '', dates: '', role: '', bullets: [''] }]
        }));
    };

    const handleRemoveWorkExp = (index) => {
        setFormData(prev => ({
            ...prev,
            work_experience: (prev.work_experience || []).filter((_, i) => i !== index)
        }));
    };

    const handleUpdateWorkExp = (index, field, val) => {
        setFormData(prev => {
            const arr = [...(prev.work_experience || [])];
            arr[index] = { ...arr[index], [field]: val };
            return { ...prev, work_experience: arr };
        });
    };

    const handleUpdateWorkExpBullets = (expIndex, text) => {
        setFormData(prev => {
            const arr = [...(prev.work_experience || [])];
            arr[expIndex] = {
                ...arr[expIndex],
                bullets: text.split('\n').map(s => s.trim()).filter(Boolean)
            };
            return { ...prev, work_experience: arr };
        });
    };

    // Recognitions helpers
    const handleAddRecognition = () => {
        setFormData(prev => ({
            ...prev,
            recognitions: [...(prev.recognitions || []), { date: '', description: '' }]
        }));
    };

    const handleRemoveRecognition = (index) => {
        setFormData(prev => ({
            ...prev,
            recognitions: (prev.recognitions || []).filter((_, i) => i !== index)
        }));
    };

    const handleUpdateRecognition = (index, field, val) => {
        setFormData(prev => {
            const arr = [...(prev.recognitions || [])];
            arr[index] = { ...arr[index], [field]: val };
            return { ...prev, recognitions: arr };
        });
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--input-bg)',
        color: 'var(--text)',
        outline: 'none',
        fontSize: '0.85rem',
        marginTop: '6px',
        transition: 'border-color 0.2s'
    };

    const textareaStyle = {
        ...inputStyle,
        minHeight: '80px',
        resize: 'vertical'
    };

    const sectionHeaderStyle = {
        fontFamily: 'var(--fh)',
        fontWeight: 800,
        fontSize: '0.9rem',
        color: 'var(--gold)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '6px',
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    };

    const groupContainerStyle = {
        background: 'rgba(var(--navy-rgb), 0.15)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px',
        marginBottom: '16px',
        position: 'relative'
    };

    const removeBtnStyle = {
        position: 'absolute',
        top: '12px',
        right: '12px',
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#ef4444',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '6px',
        padding: '4px 8px',
        fontSize: '0.72rem',
        cursor: 'pointer',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
    };

    const addBtnStyle = {
        background: 'rgba(var(--sky-rgb), 0.12)',
        color: 'var(--sky-dim)',
        border: '1px solid rgba(var(--sky-rgb), 0.25)',
        borderRadius: '8px',
        padding: '8px 16px',
        fontSize: '0.8rem',
        cursor: 'pointer',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '8px'
    };

    return (
        <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            background: 'var(--navy-dark)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
        }}>
            {/* Personal Details */}
            <div>
                <h4 style={sectionHeaderStyle}>👤 Personal Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Full Name</label>
                        <input
                            type="text"
                            value={formData.full_name || ''}
                            onChange={(e) => handleUpdateField('full_name', e.target.value)}
                            style={inputStyle}
                            placeholder="Candidate full name"
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Job Designation</label>
                        <input
                            type="text"
                            value={formData.job_title || ''}
                            onChange={(e) => handleUpdateField('job_title', e.target.value)}
                            style={inputStyle}
                            placeholder="Determined job title (e.g. PEGA CSSA)"
                        />
                    </div>
                </div>
            </div>

            {/* Profile Summary */}
            <div>
                <h4 style={sectionHeaderStyle}>📝 Profile Summary</h4>
                <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Professional Summary</label>
                    <textarea
                        value={formData.profile_summary || ''}
                        onChange={(e) => handleUpdateField('profile_summary', e.target.value)}
                        style={{ ...textareaStyle, minHeight: '100px' }}
                        placeholder="Candidate professional summary..."
                    />
                </div>
            </div>

            {/* Skills */}
            <div>
                <h4 style={sectionHeaderStyle}>🛠️ Technical & Domain Skills</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Domain Skills (Comma-separated)</label>
                        <textarea
                            value={Array.isArray(formData.domain_skills) ? formData.domain_skills.join(', ') : ''}
                            onChange={(e) => handleUpdateField('domain_skills', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            style={textareaStyle}
                            placeholder="Pega PRPC, Decisioning, Integration, Data Modeling..."
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Primary Tool/Platform</label>
                            <input
                                type="text"
                                value={formData.technical_skills?.primary || ''}
                                onChange={(e) => handleUpdateTechnicalSkill('primary', e.target.value)}
                                style={inputStyle}
                                placeholder="e.g. Pega PRPC: v8.x"
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Languages</label>
                            <input
                                type="text"
                                value={formData.technical_skills?.languages || ''}
                                onChange={(e) => handleUpdateTechnicalSkill('languages', e.target.value)}
                                style={inputStyle}
                                placeholder="e.g. Java, SQL, HTML"
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Frontend</label>
                            <input
                                type="text"
                                value={formData.technical_skills?.frontend || ''}
                                onChange={(e) => handleUpdateTechnicalSkill('frontend', e.target.value)}
                                style={inputStyle}
                                placeholder="e.g. HTML5, CSS3, JavaScript, React"
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Others</label>
                            <input
                                type="text"
                                value={formData.technical_skills?.others || ''}
                                onChange={(e) => handleUpdateTechnicalSkill('others', e.target.value)}
                                style={inputStyle}
                                placeholder="e.g. Git, Jira, Maven"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Certifications */}
            <div>
                <h4 style={sectionHeaderStyle}>🎖️ Certifications</h4>
                <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Certifications (Comma-separated)</label>
                    <textarea
                        value={Array.isArray(formData.certifications) ? formData.certifications.join(', ') : ''}
                        onChange={(e) => handleUpdateField('certifications', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        style={textareaStyle}
                        placeholder="Pega Certified Senior System Architect (CSSA), Certified System Architect (CSA)..."
                    />
                </div>
            </div>

            {/* Education */}
            <div>
                <h4 style={sectionHeaderStyle}>🎓 Education</h4>
                <div>
                    {(formData.education || []).map((edu, idx) => (
                        <div key={idx} style={groupContainerStyle}>
                            <button
                                type="button"
                                onClick={() => handleRemoveEducation(idx)}
                                style={removeBtnStyle}
                            >
                                <Trash2 size={12} /> Remove
                            </button>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Degree</label>
                                    <input
                                        type="text"
                                        value={edu.degree || ''}
                                        onChange={(e) => handleUpdateEducation(idx, 'degree', e.target.value)}
                                        style={inputStyle}
                                        placeholder="e.g. B.Tech / B.E."
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Field of Study</label>
                                    <input
                                        type="text"
                                        value={edu.field || ''}
                                        onChange={(e) => handleUpdateEducation(idx, 'field', e.target.value)}
                                        style={inputStyle}
                                        placeholder="e.g. Computer Science"
                                    />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>School/University</label>
                                    <input
                                        type="text"
                                        value={edu.school || ''}
                                        onChange={(e) => handleUpdateEducation(idx, 'school', e.target.value)}
                                        style={inputStyle}
                                        placeholder="e.g. Anna University"
                                    />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Years</label>
                                    <input
                                        type="text"
                                        value={edu.years || ''}
                                        onChange={(e) => handleUpdateEducation(idx, 'years', e.target.value)}
                                        style={inputStyle}
                                        placeholder="e.g. 2016 - 2020"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={handleAddEducation}
                        style={addBtnStyle}
                    >
                        <Plus size={14} /> Add Education
                    </button>
                </div>
            </div>

            {/* Work Experience */}
            <div>
                <h4 style={sectionHeaderStyle}>💼 Work Experience</h4>
                <div>
                    {(formData.work_experience || []).map((exp, idx) => (
                        <div key={idx} style={groupContainerStyle}>
                            <button
                                type="button"
                                onClick={() => handleRemoveWorkExp(idx)}
                                style={removeBtnStyle}
                            >
                                <Trash2 size={12} /> Remove
                            </button>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Company Name</label>
                                    <input
                                        type="text"
                                        value={exp.company || ''}
                                        onChange={(e) => handleUpdateWorkExp(idx, 'company', e.target.value)}
                                        style={inputStyle}
                                        placeholder="Company name"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Employment Dates</label>
                                    <input
                                        type="text"
                                        value={exp.dates || ''}
                                        onChange={(e) => handleUpdateWorkExp(idx, 'dates', e.target.value)}
                                        style={inputStyle}
                                        placeholder="e.g. Jul 2020 - Present"
                                    />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Role/Designation</label>
                                    <input
                                        type="text"
                                        value={exp.role || ''}
                                        onChange={(e) => handleUpdateWorkExp(idx, 'role', e.target.value)}
                                        style={inputStyle}
                                        placeholder="Role/Designation"
                                    />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Key Accomplishments (One per line)</label>
                                    <textarea
                                        value={Array.isArray(exp.bullets) ? exp.bullets.join('\n') : ''}
                                        onChange={(e) => handleUpdateWorkExpBullets(idx, e.target.value)}
                                        style={{ ...textareaStyle, minHeight: '100px' }}
                                        placeholder="Developed key microservices...&#10;Led a team of 4 engineers..."
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={handleAddWorkExp}
                        style={addBtnStyle}
                    >
                        <Plus size={14} /> Add Experience
                    </button>
                </div>
            </div>

            {/* Recognitions */}
            <div>
                <h4 style={sectionHeaderStyle}>🏆 Recognitions</h4>
                <div>
                    {(formData.recognitions || []).map((rec, idx) => (
                        <div key={idx} style={groupContainerStyle}>
                            <button
                                type="button"
                                onClick={() => handleRemoveRecognition(idx)}
                                style={removeBtnStyle}
                            >
                                <Trash2 size={12} /> Remove
                            </button>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Date</label>
                                    <input
                                        type="text"
                                        value={rec.date || ''}
                                        onChange={(e) => handleUpdateRecognition(idx, 'date', e.target.value)}
                                        style={inputStyle}
                                        placeholder="e.g. Dec 2022"
                                    />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Description</label>
                                    <input
                                        type="text"
                                        value={rec.description || ''}
                                        onChange={(e) => handleUpdateRecognition(idx, 'description', e.target.value)}
                                        style={inputStyle}
                                        placeholder="Recognition or Award description"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={handleAddRecognition}
                        style={addBtnStyle}
                    >
                        <Plus size={14} /> Add Recognition
                    </button>
                </div>
            </div>
        </div>
    );
}
