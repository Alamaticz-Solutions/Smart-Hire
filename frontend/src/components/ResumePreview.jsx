import React from 'react';
import { Loader } from 'lucide-react';

/* ─── Chunking Helpers for Original A4 Layout ─────────────────────────────── */
export const getLeftPanelChunks = (education, certifications, technical_skills, recognitions, isPrint = false) => {
    const pageHeight = isPrint ? 262 : 997;
    const topSpacer = isPrint ? 35 : 133;
    const pageHeaderBranding = isPrint ? 25 : 95;
    
    const page1Available = pageHeight - topSpacer;
    const pageNAvailable = pageHeight - pageHeaderBranding;

    const sections = [];
    
    if (education && education.length > 0) {
        let h = isPrint ? (10 + education.length * 10) : (38 + education.length * 38);
        sections.push({ type: 'education', height: h });
    }
    
    if (certifications && certifications.length > 0) {
        let h = isPrint ? (10 + certifications.length * 5) : (38 + certifications.length * 19);
        sections.push({ type: 'certifications', height: h });
    }
    
    if (technical_skills && Object.keys(technical_skills).length > 0) {
        let activeCategories = 0;
        if (technical_skills.primary) activeCategories++;
        if (technical_skills.languages) activeCategories++;
        if (technical_skills.frontend) activeCategories++;
        if (technical_skills.others) activeCategories++;
        let h = isPrint ? (10 + activeCategories * 6) : (38 + activeCategories * 23);
        sections.push({ type: 'technical_skills', height: h });
    }
    
    if (recognitions && recognitions.length > 0) {
        let itemsHeight = 0;
        recognitions.forEach(rec => {
            const textLen = (rec.date ? rec.date.length : 0) + (rec.description ? rec.description.length : 0);
            if (isPrint) {
                itemsHeight += Math.ceil(textLen / 25) * 4.5 + 2.5;
            } else {
                itemsHeight += Math.ceil(textLen / 25) * 17 + 9.5;
            }
        });
        let h = isPrint ? (10 + itemsHeight) : (38 + itemsHeight);
        sections.push({ type: 'recognitions', height: h });
    }
    
    const chunks = [];
    let currentPageSections = [];
    let currentAvailableHeight = page1Available;
    
    sections.forEach(sec => {
        const totalSecHeight = sec.height + (isPrint ? 8 : 30);
        
        if (currentAvailableHeight >= totalSecHeight || currentPageSections.length === 0) {
            currentPageSections.push(sec.type);
            currentAvailableHeight -= totalSecHeight;
        } else {
            chunks.push(currentPageSections);
            currentPageSections = [sec.type];
            currentAvailableHeight = pageNAvailable - totalSecHeight;
        }
    });
    
    if (currentPageSections.length > 0) {
        chunks.push(currentPageSections);
    }
    
    return chunks;
};

export const getDynamicWorkExpChunks = (jobs, profile_summary, domain_skills, isPrint = false) => {
    const pageHeight = isPrint ? 262 : 997;
    const topSpacer = isPrint ? 35 : 133;
    const pageHeaderBranding = isPrint ? 20 : 76;
    
    const page1Available = pageHeight - topSpacer;
    const pageNAvailable = pageHeight - pageHeaderBranding;

    const profileSummaryHeight = profile_summary 
        ? 10 + Math.ceil(profile_summary.length / 65) * (isPrint ? 4.5 : 17) + (isPrint ? 8 : 30)
        : 0;
        
    const domainSkillsHeight = domain_skills && domain_skills.length > 0
        ? 10 + Math.ceil(domain_skills.length / 2) * (isPrint ? 5 : 19) + (isPrint ? 8 : 30)
        : 0;

    const workExpHeaderHeight = 10 + (isPrint ? 8 : 30);

    const page1AvailableForJobs = page1Available - profileSummaryHeight - domainSkillsHeight - workExpHeaderHeight;
    const pageNAvailableForJobs = pageNAvailable - workExpHeaderHeight;

    const chunks = [];
    let currentPageJobs = [];
    let currentAvailableHeight = page1AvailableForJobs;

    const getJobHeaderHeightVal = (isCont) => {
        if (isCont) {
            return isPrint ? 8 : 30;
        } else {
            return isPrint ? 12 : 45;
        }
    };

    const getBulletHeightVal = (bullet) => {
        const text = bullet || '';
        const lines = Math.ceil(text.length / 65) || 1;
        return lines * (isPrint ? 4.5 : 17) + (isPrint ? 1.0 : 4);
    };

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const headerHeight = getJobHeaderHeightVal(false);
        
        const firstBulletHeight = job.bullets && job.bullets.length > 0 ? getBulletHeightVal(job.bullets[0]) : 0;
        const requiredMinHeight = headerHeight + firstBulletHeight + (isPrint ? 5 : 19);

        if (currentAvailableHeight < requiredMinHeight) {
            chunks.push(currentPageJobs);
            currentPageJobs = [];
            currentAvailableHeight = pageNAvailableForJobs;
        }

        let jobBulletsOnThisPage = [];
        let jobBulletsOnNextPage = [...(job.bullets || [])];
        let currentJobHeight = headerHeight;

        while (jobBulletsOnNextPage.length > 0) {
            const nextBullet = jobBulletsOnNextPage[0];
            const nextBulletHeight = getBulletHeightVal(nextBullet);
            
            if (currentAvailableHeight >= currentJobHeight + nextBulletHeight) {
                jobBulletsOnThisPage.push(jobBulletsOnNextPage.shift());
                currentJobHeight += nextBulletHeight;
            } else {
                break;
            }
        }

        if (jobBulletsOnThisPage.length > 0 || (job.bullets || []).length === 0) {
            currentPageJobs.push({
                ...job,
                bullets: jobBulletsOnThisPage,
                isContinuation: false
            });
            currentAvailableHeight -= currentJobHeight + (isPrint ? 4 : 15);
        } else {
            if (currentPageJobs.length > 0) {
                chunks.push(currentPageJobs);
                currentPageJobs = [];
                currentAvailableHeight = pageNAvailableForJobs;
            }
            
            currentJobHeight = headerHeight;
            while (jobBulletsOnNextPage.length > 0) {
                const nextBullet = jobBulletsOnNextPage[0];
                const nextBulletHeight = getBulletHeightVal(nextBullet);
                if (currentAvailableHeight >= currentJobHeight + nextBulletHeight || jobBulletsOnThisPage.length === 0) {
                    jobBulletsOnThisPage.push(jobBulletsOnNextPage.shift());
                    currentJobHeight += nextBulletHeight;
                } else {
                    break;
                }
            }
            
            currentPageJobs.push({
                ...job,
                bullets: jobBulletsOnThisPage,
                isContinuation: false
            });
            currentAvailableHeight -= currentJobHeight + (isPrint ? 4 : 15);
        }

        while (jobBulletsOnNextPage.length > 0) {
            chunks.push(currentPageJobs);
            currentPageJobs = [];
            currentAvailableHeight = pageNAvailableForJobs;

            let contJobBullets = [];
            let contJobHeight = getJobHeaderHeightVal(true);

            while (jobBulletsOnNextPage.length > 0) {
                const nextBullet = jobBulletsOnNextPage[0];
                const nextBulletHeight = getBulletHeightVal(nextBullet);
                if (currentAvailableHeight >= contJobHeight + nextBulletHeight || contJobBullets.length === 0) {
                    contJobBullets.push(jobBulletsOnNextPage.shift());
                    contJobHeight += nextBulletHeight;
                } else {
                    break;
                }
            }

            currentPageJobs.push({
                ...job,
                role: `${job.role} (Contd.)`,
                bullets: contJobBullets,
                isContinuation: true
            });
            currentAvailableHeight -= contJobHeight + (isPrint ? 4 : 15);
        }
    }

    if (currentPageJobs.length > 0) {
        chunks.push(currentPageJobs);
    }

    return chunks;
};

/* ─── Resume Preview component (Alamaticz Solutions Template) ────────────── */
export default function ResumePreview({ data, logoUrl, templateId = 'alamaticz' }) {
    React.useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => {
            document.head.removeChild(link);
        };
    }, []);

    
    if (!data) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', gap: '12px', padding: '40px' }}>
                <Loader className="spin" size={28} style={{ color: 'var(--gold)' }} />
                <span>Loading formatted resume...</span>
            </div>
        );
    }

    if (templateId === 'modern') {
        return <ModernResumePreview data={data} />;
    }
    if (templateId === 'classic') {
        return <ClassicResumePreview data={data} />;
    }

    const {
        full_name = '',
        job_title = '',
        profile_summary = '',
        domain_skills = [],
        technical_skills = {},
        education = [],
        certifications = [],
        work_experience = [],
        recognitions = []
    } = data;

    const expChunks = getDynamicWorkExpChunks(work_experience, profile_summary, domain_skills, false);
    const leftChunks = getLeftPanelChunks(education, certifications, technical_skills, recognitions, false);
    const totalPages = Math.max(expChunks.length, leftChunks.length);

    return (
        <div className="resume-preview-container" style={{
            flex: 1,
            overflowY: 'auto',
            background: 'var(--surface-sunken)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px'
        }}>
            {Array.from({ length: totalPages }).map((_, pageIdx) => {
                const isFirstPage = pageIdx === 0;
                const chunk = expChunks[pageIdx] || [];
                const leftSections = leftChunks[pageIdx] || [];
                
                return (
                    <div key={pageIdx} className="resume-a4-sheet" style={{
                        width: '100%',
                        maxWidth: '800px',
                        height: '1130px',
                        flexShrink: 0,
                        overflow: 'hidden',
                        background: '#ffffff',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                        display: 'flex',
                        color: '#333333',
                        fontFamily: "'Outfit', 'Segoe UI', sans-serif",
                        fontSize: '13px',
                        lineHeight: '1.5',
                        boxSizing: 'border-box'
                    }}>
                        {/* Left Panel */}
                        <div style={{
                            width: '32%',
                            background: '#e6f0fa',
                            padding: '76px 18px 57px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            boxSizing: 'border-box',
                            borderRight: '1px solid rgba(0,0,0,0.05)',
                            height: '100%',
                            overflow: 'hidden'
                        }}>
                            {isFirstPage ? (
                                <div style={{ height: '133px', flexShrink: 0, visibility: 'hidden', pointerEvents: 'none' }} />
                            ) : null}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', flexShrink: 0 }}>
                                {leftSections.map(secType => {
                                    if (secType === 'education' && education && education.length > 0) {
                                        return (
                                            <div key="education">
                                                <h4 style={{
                                                    margin: '0 0 15px 0',
                                                    color: '#004b87',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                    borderBottom: '2px solid #004b87',
                                                    paddingBottom: '8px'
                                                }}>Education</h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                                    {education.map((edu, idx) => (
                                                        <div key={idx}>
                                                            <div style={{ fontWeight: 700, color: '#333', fontSize: '0.78rem' }}>
                                                                {edu.degree}{edu.field ? ` - ${edu.field}` : ''}
                                                            </div>
                                                            <div style={{ color: '#555', fontSize: '0.74rem', marginTop: '2px' }}>
                                                                {edu.school}
                                                            </div>
                                                            {edu.years && (
                                                                <div style={{ color: '#777', fontSize: '0.72rem', marginTop: '1px' }}>
                                                                    {edu.years}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    if (secType === 'certifications' && certifications && certifications.length > 0) {
                                        return (
                                            <div key="certifications">
                                                <h4 style={{
                                                    margin: '0 0 15px 0',
                                                    color: '#004b87',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                    borderBottom: '2px solid #004b87',
                                                    paddingBottom: '8px'
                                                }}>Certifications</h4>
                                                <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem', color: '#444' }}>
                                                    {certifications.map((cert, idx) => (
                                                        <li key={idx}>{cert}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    }
                                    if (secType === 'technical_skills' && technical_skills && Object.keys(technical_skills).length > 0) {
                                        return (
                                            <div key="technical_skills">
                                                <h4 style={{
                                                    margin: '0 0 15px 0',
                                                    color: '#004b87',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                    borderBottom: '2px solid #004b87',
                                                    paddingBottom: '8px'
                                                }}>Technical Skills</h4>
                                                <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.74rem', color: '#333' }}>
                                                    {technical_skills.primary && (
                                                        <li><strong>Primary:</strong> {technical_skills.primary}</li>
                                                    )}
                                                    {technical_skills.languages && (
                                                        <li><strong>Languages:</strong> {technical_skills.languages}</li>
                                                    )}
                                                    {technical_skills.frontend && (
                                                        <li><strong>Frontend:</strong> {technical_skills.frontend}</li>
                                                    )}
                                                    {technical_skills.others && (
                                                        <li><strong>Others:</strong> {technical_skills.others}</li>
                                                    )}
                                                </ul>
                                            </div>
                                        );
                                    }
                                    if (secType === 'recognitions' && recognitions && recognitions.length > 0) {
                                        return (
                                            <div key="recognitions">
                                                <h4 style={{
                                                    margin: '0 0 15px 0',
                                                    color: '#004b87',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                    borderBottom: '2px solid #004b87',
                                                    paddingBottom: '8px'
                                                }}>Recognitions</h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', fontSize: '0.74rem' }}>
                                                    {recognitions.map((rec, idx) => (
                                                        <div key={idx} style={{ marginBottom: '4px' }}>
                                                            <span style={{ fontWeight: 700, color: '#333' }}>{rec.date ? `[${rec.date}] ` : ''}</span>
                                                            <span style={{ color: '#555' }}>{rec.description}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>

                            {leftSections.length === 0 && (
                                <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.5 }}>
                                    <div style={{ fontWeight: 700, color: '#004b87', fontSize: '0.8rem', textTransform: 'uppercase' }}>Alamaticz</div>
                                    <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '4px' }}>Candidate Profile</div>
                                </div>
                            )}
                        </div>

                        {/* Right Panel */}
                        <div style={{
                            width: '68%',
                            padding: '76px 28px 57px 28px',
                            display: 'flex',
                            flexDirection: 'column',
                            boxSizing: 'border-box',
                            height: '100%',
                            overflow: 'hidden'
                        }}>
                            {isFirstPage ? (
                                <div style={{ 
                                    minHeight: '133px', 
                                    height: 'auto', 
                                    flexShrink: 0,
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '12px',
                                    borderBottom: '1px solid #004b87',
                                    paddingBottom: '10px',
                                    boxSizing: 'border-box'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                                        {logoUrl && (
                                            <img src={logoUrl} alt="Logo ribbon" style={{ height: '36px', objectFit: 'contain' }} />
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Outfit', sans-serif", lineHeight: 1.1, textAlign: 'left' }}>
                                            <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#0f172a', letterSpacing: '0.05em' }}>ALAMATICZ</span>
                                            <span style={{ fontWeight: 400, fontSize: '0.68rem', color: '#64748b', letterSpacing: '0.18em' }}>SOLUTIONS</span>
                                        </div>
                                    </div>
                                    <div style={{ borderBottom: '1px solid #ddd', paddingBottom: '4px' }} />
                                    <div style={{ marginTop: '8px' }}>
                                        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#004b87', textTransform: 'uppercase', letterSpacing: '0.02em', fontFamily: "'Outfit', sans-serif", lineHeight: '1.1' }}>
                                            {full_name}
                                        </h1>
                                        <div style={{ fontSize: '0.85rem', color: '#4b779a', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {job_title}
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', flexShrink: 0 }}>
                                {isFirstPage && profile_summary && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <h4 style={{
                                            margin: 0,
                                            color: '#004b87',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            borderBottom: '1px solid #ddd',
                                            paddingBottom: '4px'
                                        }}>Profile Summary</h4>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#444', textAlign: 'justify', lineHeight: 1.6 }}>
                                            {profile_summary}
                                        </p>
                                    </div>
                                )}

                                {isFirstPage && domain_skills && domain_skills.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <h4 style={{
                                            margin: 0,
                                            color: '#004b87',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            borderBottom: '1px solid #ddd',
                                            paddingBottom: '4px'
                                        }}>Domain Skills</h4>
                                        <ul style={{ margin: 0, paddingLeft: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.8rem' }}>
                                            {domain_skills.map((skill, idx) => (
                                                <li key={idx} style={{ color: '#444' }}>{skill}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {chunk && chunk.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <h4 style={{
                                            margin: 0,
                                            color: '#004b87',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            borderBottom: '1px solid #ddd',
                                            paddingBottom: '4px'
                                        }}>
                                            {isFirstPage ? 'Work Experience' : 'Work Experience (Contd.)'}
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            {chunk.map((exp, idx) => (
                                                <div key={idx}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                        <span style={{ fontWeight: 700, color: '#333', fontSize: '0.85rem' }}>
                                                            {exp.isContinuation ? `${exp.company} (Contd.)` : exp.company}
                                                        </span>
                                                        {!exp.isContinuation && (
                                                            <span style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic' }}>{exp.dates}</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontStyle: 'italic', color: '#555', fontSize: '0.78rem', marginTop: '2px', fontWeight: 600 }}>{exp.role}</div>
                                                    {exp.bullets && exp.bullets.length > 0 && (
                                                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem' }}>
                                                            {exp.bullets.map((bullet, bIdx) => (
                                                                <li key={bIdx} style={{ color: '#555', textAlign: 'justify' }}>{bullet}</li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function getResumeHtml(data, candidate, logoUrl, templateId = 'alamaticz') {
    if (!data) return '';
    const {
        full_name = '',
        job_title = '',
        profile_summary = '',
        domain_skills = [],
        technical_skills = {},
        education = [],
        certifications = [],
        work_experience = [],
        recognitions = []
    } = data;

    
    if (templateId === 'modern') {
        return getModernResumeHtml(data, candidate);
    }
    if (templateId === 'classic') {
        return getClassicResumeHtml(data, candidate);
    }

    const fullLogoUrl = logoUrl && (logoUrl.startsWith('data:') || logoUrl.startsWith('http') ? logoUrl : window.location.origin + logoUrl);

    const expChunks = getDynamicWorkExpChunks(work_experience, profile_summary, domain_skills, true);
    const leftChunks = getLeftPanelChunks(education, certifications, technical_skills, recognitions, true);
    const totalPages = Math.max(expChunks.length, leftChunks.length);

    const pagesHtml = Array.from({ length: totalPages }).map((_, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const chunk = expChunks[pageIdx] || [];
        const leftSections = leftChunks[pageIdx] || [];
        
        return `
        ${pageIdx > 0 ? '<div class="page-break"></div>' : ''}
        <div class="resume-container">
            <!-- Left Panel -->
            <div class="left-panel">
                ${isFirstPage ? `
                    <div style="height: 35mm; visibility: hidden; pointer-events: none;"></div>
                ` : ''}

                <div style="display: flex; flex-direction: column; gap: 8mm;">
                    ${leftSections.map(secType => {
                        if (secType === 'education' && education && education.length > 0) {
                            return `
                            <div class="section">
                                <h4>Education</h4>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${education.map(edu => `
                                    <div style="margin-bottom: 4px;">
                                        <div style="font-size: 11px; font-weight: 700; color: #333;">${edu.degree}${edu.field ? ` - ${edu.field}` : ''}</div>
                                        <div style="font-size: 10.5px; color: #555; margin-top: 2px;">${edu.school}</div>
                                        ${edu.years ? `<div style="font-size: 9.5px; color: #777; margin-top: 1px;">${edu.years}</div>` : ''}
                                    </div>
                                    `).join('')}
                                </div>
                            </div>
                            `;
                        }
                        if (secType === 'certifications' && certifications && certifications.length > 0) {
                            return `
                            <div class="section">
                                <h4>Certifications</h4>
                                <ul style="padding-left: 15px; margin: 4px 0 0 0;">
                                    ${certifications.map(cert => `
                                    <li style="font-size: 10.5px; color: #333; margin-bottom: 4px;">${cert}</li>
                                    `).join('')}
                                </ul>
                            </div>
                            `;
                        }
                        if (secType === 'technical_skills' && technical_skills && Object.keys(technical_skills).length > 0) {
                            return `
                            <div class="section">
                                <h4>Technical Skills</h4>
                                <ul style="padding-left: 15px; margin: 4px 0 0 0; font-size: 10.5px; color: #333; display: flex; flex-direction: column; gap: 6px;">
                                    ${technical_skills.primary ? `<li><strong>Primary:</strong> ${technical_skills.primary}</li>` : ''}
                                    ${technical_skills.languages ? `<li><strong>Languages:</strong> ${technical_skills.languages}</li>` : ''}
                                    ${technical_skills.frontend ? `<li><strong>Frontend:</strong> ${technical_skills.frontend}</li>` : ''}
                                    ${technical_skills.others ? `<li><strong>Others:</strong> ${technical_skills.others}</li>` : ''}
                                </ul>
                            </div>
                            `;
                        }
                        if (secType === 'recognitions' && recognitions && recognitions.length > 0) {
                            return `
                            <div class="section">
                                <h4>Recognitions</h4>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    ${recognitions.map(rec => `
                                    <div style="margin-bottom: 4px;">
                                        <span style="font-weight: 700; color: #333; font-size: 10.5px;">${rec.date ? `[${rec.date}] ` : ''}</span>
                                        <span style="color: #555; font-size: 10.5px;">${rec.description}</span>
                                    </div>
                                    `).join('')}
                                </div>
                            </div>
                            `;
                        }
                        return '';
                    }).join('')}
                </div>
            </div>

            <!-- Right Panel -->
            <div class="right-panel">
                ${isFirstPage ? `
                    <div style="border-bottom: 1px solid #004b87; padding-bottom: 4mm; margin-bottom: 6mm; box-sizing: border-box;">
                        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-bottom: 4mm;">
                            ${fullLogoUrl ? `<img src="${fullLogoUrl}" alt="Logo ribbon" style="height: 36px; object-fit: contain;" />` : ''}
                            <div style="display: flex; flex-direction: column; font-family: 'Outfit', sans-serif; line-height: 1.1; text-align: left;">
                                <span style="font-weight: 800; font-size: 20px; color: #0f172a; letter-spacing: 0.05em; text-transform: uppercase;">ALAMATICZ</span>
                                <span style="font-weight: 400; font-size: 11px; color: #64748b; letter-spacing: 0.18em; text-transform: uppercase;">SOLUTIONS</span>
                            </div>
                        </div>
                        <div style="border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 4mm;"></div>
                        <div>
                            <h1 class="candidate-name" style="margin: 0; font-size: 30px; font-weight: 800; color: #004b87; text-transform: uppercase; line-height: 1.2;">${full_name}</h1>
                            <div class="candidate-title" style="margin-top: 4px; font-size: 12px; color: #4b779a; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${job_title}</div>
                        </div>
                    </div>
                ` : ''}

                <div>
                    ${isFirstPage && profile_summary ? `
                    <div class="section">
                        <h4>Profile Summary</h4>
                        <p class="summary-text">${profile_summary}</p>
                    </div>
                    ` : ''}

                    ${isFirstPage && domain_skills && domain_skills.length > 0 ? `
                    <div class="section">
                        <h4>Domain Skills</h4>
                        <ul class="domain-grid">
                            ${domain_skills.map(skill => `<li>${skill}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}

                    ${chunk && chunk.length > 0 ? `
                    <div class="section">
                        <h4>${isFirstPage ? 'Work Experience' : 'Work Experience (Contd.)'}</h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${chunk.map(exp => `
                            <div class="exp-item">
                                <div class="exp-header">
                                    <span class="exp-company">${exp.isContinuation ? `${exp.company} (Contd.)` : exp.company}</span>
                                    ${!exp.isContinuation ? `<span class="exp-dates">${exp.dates || ''}</span>` : ''}
                                </div>
                                <div class="exp-role">${exp.role || ''}</div>
                                ${exp.bullets && exp.bullets.length > 0 ? `
                                <ul class="exp-bullets">
                                    ${exp.bullets.map(bullet => `<li>${bullet}</li>`).join('')}
                                </ul>
                                ` : ''}
                            </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <title>Resume - ${full_name}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
        
        @page {
            size: A4;
            margin: 0;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 0;
            font-family: 'Outfit', 'Segoe UI', sans-serif;
            background: #ffffff;
            color: #333333;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        .resume-container {
            display: flex;
            width: 210mm;
            height: 297mm;
            overflow: hidden;
            background: #ffffff;
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
        }

        .left-panel {
            width: 32%;
            height: 100%;
            background-color: #e6f0fa !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
            padding: 20mm 15mm 15mm 15mm;
            border-right: 1px solid rgba(0,0,0,0.05);
        }

        .right-panel {
            width: 68%;
            height: 100%;
            padding: 20mm 20mm 15mm 20mm;
        }

        .section {
            margin-bottom: 8mm;
        }

        h4 {
            margin: 0 0 4mm 0;
            color: #004b87;
            font-size: 11.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 1.5px solid #004b87;
            padding-bottom: 2mm;
        }

        .right-panel h4 {
            border-bottom: 1px solid #ddd;
        }

        ul {
            margin: 0;
            padding-left: 15px;
        }

        li {
            font-size: 11px;
            color: #333;
            margin-bottom: 4px;
        }

        .right-panel li {
            color: #444;
        }

        .candidate-name {
            margin: 0;
            font-size: 30px;
            font-weight: 800;
            color: #004b87;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            line-height: 1.1;
        }

        .candidate-title {
            font-size: 12px;
            color: #4b779a;
            font-weight: 600;
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .summary-text {
            margin: 5px 0 0 0;
            font-size: 11px;
            color: #444;
            text-align: justify;
            line-height: 1.5;
        }

        .domain-grid {
            margin: 5px 0 0 0;
            padding-left: 15px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }

        .exp-item {
            margin-bottom: 12px;
        }

        .exp-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
        }

        .exp-company {
            font-weight: 700;
            color: #222;
            font-size: 11.5px;
        }

        .exp-dates {
            font-size: 9.5px;
            color: #666;
            font-style: italic;
        }

        .exp-role {
            font-style: italic;
            color: #555;
            font-size: 10.5px;
            margin-top: 1px;
            font-weight: 600;
        }

        .exp-bullets {
            margin: 4px 0 0 0;
            padding-left: 15px;
            display: flex;
            flex-direction: column;
            gap: 2.5px;
            font-size: 10.5px;
        }

        .exp-bullets li {
            color: #555;
            text-align: justify;
        }

        .page-break {
            page-break-before: always;
            break-before: page;
        }

        @media print {
            body {
                background: #ffffff !important;
                color: #333333 !important;
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .resume-container {
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .left-panel {
                background-color: #e6f0fa !important;
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .right-panel {
                background: #ffffff !important;
            }
            h4 {
                color: #004b87 !important;
            }
            .candidate-name {
                color: #004b87 !important;
            }
            .candidate-title {
                color: #4b779a !important;
            }
        }
    </style>
</head>
<body>
    ${pagesHtml}
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 300);
        };
    </script>
</body>
</html>`;
}



// --- MODERN TEMPLATE ---
function ModernResumePreview({ data }) {
    if (!data) return null;
    const {
        full_name = '', job_title = '', profile_summary = '', domain_skills = [],
        technical_skills = {}, education = [], certifications = [], work_experience = [], recognitions = []
    } = data;

    return (
        <div style={{ flex: 1, overflowY: 'auto', background: '#525659', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '800px', background: '#fff', padding: '40px 50px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', fontFamily: '\'Segoe UI\', Roboto, sans-serif', color: '#333', fontSize: '13px', lineHeight: '1.6' }}>
                <div style={{ borderBottom: '3px solid #00bcd4', paddingBottom: '20px', marginBottom: '20px' }}>
                    <h1 style={{ margin: 0, fontSize: '2.2rem', color: '#2c3e50', letterSpacing: '1px' }}>{full_name}</h1>
                    <div style={{ fontSize: '1.1rem', color: '#00bcd4', fontWeight: 600, marginTop: '5px' }}>{job_title}</div>
                </div>
                
                {profile_summary && (
                    <div style={{ marginBottom: '25px' }}>
                        <h3 style={{ color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '10px' }}>PROFILE</h3>
                        <p style={{ margin: 0, textAlign: 'justify' }}>{profile_summary}</p>
                    </div>
                )}

                {(domain_skills.length > 0 || Object.keys(technical_skills).length > 0) && (
                    <div style={{ marginBottom: '25px' }}>
                        <h3 style={{ color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '10px' }}>SKILLS</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {domain_skills.map((s, i) => <span key={'d'+i} style={{ background: '#f0f4f8', padding: '4px 10px', borderRadius: '15px', fontSize: '12px' }}>{s}</span>)}
                            {Object.values(technical_skills).filter(Boolean).map((s, i) => String(s).split(',').map((item, j) => <span key={'t'+i+'_'+j} style={{ background: '#e0f7fa', padding: '4px 10px', borderRadius: '15px', fontSize: '12px' }}>{item.trim()}</span>))}
                        </div>
                    </div>
                )}

                {work_experience && work_experience.length > 0 && (
                    <div style={{ marginBottom: '25px' }}>
                        <h3 style={{ color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '15px' }}>EXPERIENCE</h3>
                        {work_experience.map((exp, idx) => (
                            <div key={idx} style={{ marginBottom: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                    <span style={{ fontSize: '14px' }}>{exp.company}</span>
                                    <span style={{ color: '#00bcd4', fontSize: '12px' }}>{exp.dates}</span>
                                </div>
                                <div style={{ fontStyle: 'italic', color: '#555', marginBottom: '5px' }}>{exp.role}</div>
                                {exp.bullets && exp.bullets.length > 0 && (
                                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                        {exp.bullets.map((b, i) => <li key={i} style={{ marginBottom: '3px', textAlign: 'justify' }}>{b}</li>)}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {education && education.length > 0 && (
                    <div style={{ marginBottom: '25px' }}>
                        <h3 style={{ color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '10px' }}>EDUCATION</h3>
                        {education.map((edu, idx) => (
                            <div key={idx} style={{ marginBottom: '10px' }}>
                                <div style={{ fontWeight: 'bold' }}>{edu.degree}{edu.field ? ` - ${edu.field}` : ''}</div>
                                <div>{edu.school} {edu.years ? `| ${edu.years}` : ''}</div>
                            </div>
                        ))}
                    </div>
                )}

                {certifications && certifications.length > 0 && (
                    <div style={{ marginBottom: '25px' }}>
                        <h3 style={{ color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '10px' }}>CERTIFICATIONS</h3>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            {certifications.map((cert, idx) => <li key={idx}>{cert}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function getModernResumeHtml(data, candidate) {
    // Basic HTML string builder for modern template
    return `<!DOCTYPE html><html><head><title>Resume - ${data.full_name || ''}</title>
    <style>
        body { font-family: 'Segoe UI', Roboto, sans-serif; color: #333; font-size: 13px; line-height: 1.6; margin: 0; padding: 40px 50px; }
        h1 { margin: 0; font-size: 2.2rem; color: #2c3e50; letter-spacing: 1px; }
        .title { font-size: 1.1rem; color: #00bcd4; font-weight: 600; margin-top: 5px; }
        .header { border-bottom: 3px solid #00bcd4; padding-bottom: 20px; margin-bottom: 20px; }
        h3 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
        .badge { display: inline-block; background: #f0f4f8; padding: 4px 10px; border-radius: 15px; font-size: 12px; margin: 2px 4px 2px 0; }
        .badge-tech { background: #e0f7fa; }
        .exp-head { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
        .exp-dates { color: #00bcd4; font-size: 12px; }
        .exp-role { font-style: italic; color: #555; margin-bottom: 5px; }
        ul { margin: 0; padding-left: 20px; }
        li { margin-bottom: 3px; text-align: justify; }
        .section { margin-bottom: 25px; page-break-inside: avoid; }
    </style></head><body>
        <div class='header'>
            <h1>${data.full_name || ''}</h1>
            <div class='title'>${data.job_title || ''}</div>
        </div>
        ${data.profile_summary ? `<div class='section'><h3>Profile</h3><p style='margin:0; text-align:justify;'>${data.profile_summary}</p></div>` : ''}
        ${(data.domain_skills?.length > 0 || Object.keys(data.technical_skills || {}).length > 0) ? `<div class='section'><h3>Skills</h3><div>
            ${(data.domain_skills||[]).map(s => `<span class='badge'>${s}</span>`).join('')}
            ${Object.values(data.technical_skills||{}).filter(Boolean).map(s => String(s).split(',').map(item => `<span class='badge badge-tech'>${item.trim()}</span>`).join('')).join('')}
        </div></div>` : ''}
        ${data.work_experience?.length > 0 ? `<div class='section'><h3>Experience</h3>
            ${data.work_experience.map(exp => `
                <div style='margin-bottom: 15px; page-break-inside: avoid;'>
                    <div class='exp-head'><span>${exp.company}</span><span class='exp-dates'>${exp.dates || ''}</span></div>
                    <div class='exp-role'>${exp.role || ''}</div>
                    ${exp.bullets?.length > 0 ? `<ul>${exp.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
                </div>
            `).join('')}
        </div>` : ''}
        ${data.education?.length > 0 ? `<div class='section'><h3>Education</h3>
            ${data.education.map(edu => `<div style='margin-bottom: 10px;'><b>${edu.degree}${edu.field ? ` - ${edu.field}` : ''}</b><br>${edu.school} ${edu.years ? `| ${edu.years}` : ''}</div>`).join('')}
        </div>` : ''}
        ${data.certifications?.length > 0 ? `<div class='section'><h3>Certifications</h3><ul>
            ${data.certifications.map(c => `<li>${c}</li>`).join('')}
        </ul></div>` : ''}
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };</script>
    </body></html>`;
}

// --- CLASSIC TEMPLATE ---
function ClassicResumePreview({ data }) {
    if (!data) return null;
    const {
        full_name = '', job_title = '', profile_summary = '', domain_skills = [],
        technical_skills = {}, education = [], certifications = [], work_experience = [], recognitions = []
    } = data;

    return (
        <div style={{ flex: 1, overflowY: 'auto', background: '#525659', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '800px', background: '#fff', padding: '50px 60px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', fontFamily: '\'Times New Roman\', Times, serif', color: '#000', fontSize: '14px', lineHeight: '1.5' }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ margin: 0, fontSize: '2.5rem', textTransform: 'uppercase', letterSpacing: '2px' }}>{full_name}</h1>
                    <div style={{ fontSize: '1.2rem', marginTop: '8px', fontStyle: 'italic' }}>{job_title}</div>
                </div>
                
                {profile_summary && (
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '3px', marginBottom: '10px' }}>Professional Summary</h3>
                        <p style={{ margin: 0, textAlign: 'justify' }}>{profile_summary}</p>
                    </div>
                )}

                {(domain_skills.length > 0 || Object.keys(technical_skills).length > 0) && (
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '3px', marginBottom: '10px' }}>Core Competencies</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {[...domain_skills, ...Object.values(technical_skills).filter(Boolean).flatMap(s => String(s).split(',').map(x=>x.trim()))].map((s, i, arr) => (
                                <span key={i} style={{ display: 'inline-block' }}>{s}{i < arr.length - 1 ? '\u00A0\u2022\u00A0' : ''}</span>
                            ))}
                        </div>
                    </div>
                )}

                {work_experience && work_experience.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '3px', marginBottom: '10px' }}>Professional Experience</h3>
                        {work_experience.map((exp, idx) => (
                            <div key={idx} style={{ marginBottom: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                    <span>{exp.company}</span>
                                    <span>{exp.dates}</span>
                                </div>
                                <div style={{ fontStyle: 'italic', marginBottom: '5px' }}>{exp.role}</div>
                                {exp.bullets && exp.bullets.length > 0 && (
                                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                        {exp.bullets.map((b, i) => <li key={i} style={{ marginBottom: '4px', textAlign: 'justify' }}>{b}</li>)}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {education && education.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '3px', marginBottom: '10px' }}>Education</h3>
                        {education.map((edu, idx) => (
                            <div key={idx} style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <span style={{ fontWeight: 'bold' }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ''}</span>
                                    <br />{edu.school}
                                </div>
                                <div>{edu.years}</div>
                            </div>
                        ))}
                    </div>
                )}

                {certifications && certifications.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '3px', marginBottom: '10px' }}>Certifications</h3>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            {certifications.map((cert, idx) => <li key={idx}>{cert}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function getClassicResumeHtml(data, candidate) {
    return `<!DOCTYPE html><html><head><title>Resume - ${data.full_name || ''}</title>
    <style>
        body { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 14px; line-height: 1.5; margin: 0; padding: 50px 60px; }
        h1 { margin: 0; font-size: 2.5rem; text-transform: uppercase; letter-spacing: 2px; text-align: center; }
        .title { font-size: 1.2rem; margin-top: 8px; font-style: italic; text-align: center; margin-bottom: 30px; }
        h3 { text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 3px; margin-bottom: 10px; font-size: 16px; }
        .exp-head { display: flex; justify-content: space-between; font-weight: bold; }
        .exp-role { font-style: italic; margin-bottom: 5px; }
        ul { margin: 0; padding-left: 20px; }
        li { margin-bottom: 4px; text-align: justify; }
        .section { margin-bottom: 20px; page-break-inside: avoid; }
    </style></head><body>
        <h1>${data.full_name || ''}</h1>
        <div class='title'>${data.job_title || ''}</div>
        ${data.profile_summary ? `<div class='section'><h3>Professional Summary</h3><p style='margin:0; text-align:justify;'>${data.profile_summary}</p></div>` : ''}
        ${(data.domain_skills?.length > 0 || Object.keys(data.technical_skills || {}).length > 0) ? `<div class='section'><h3>Core Competencies</h3><div>
            ${[...(data.domain_skills||[]), ...Object.values(data.technical_skills||{}).filter(Boolean).flatMap(s => String(s).split(',').map(x=>x.trim()))].join('&nbsp;&bull;&nbsp;')}
        </div></div>` : ''}
        ${data.work_experience?.length > 0 ? `<div class='section'><h3>Professional Experience</h3>
            ${data.work_experience.map(exp => `
                <div style='margin-bottom: 15px; page-break-inside: avoid;'>
                    <div class='exp-head'><span>${exp.company}</span><span>${exp.dates || ''}</span></div>
                    <div class='exp-role'>${exp.role || ''}</div>
                    ${exp.bullets?.length > 0 ? `<ul>${exp.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
                </div>
            `).join('')}
        </div>` : ''}
        ${data.education?.length > 0 ? `<div class='section'><h3>Education</h3>
            ${data.education.map(edu => `<div style='margin-bottom: 10px; display: flex; justify-content: space-between;'>
                <div><b>${edu.degree}${edu.field ? ` in ${edu.field}` : ''}</b><br>${edu.school}</div>
                <div>${edu.years || ''}</div>
            </div>`).join('')}
        </div>` : ''}
        ${data.certifications?.length > 0 ? `<div class='section'><h3>Certifications</h3><ul>
            ${data.certifications.map(c => `<li>${c}</li>`).join('')}
        </ul></div>` : ''}
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };</script>
    </body></html>`;
}
