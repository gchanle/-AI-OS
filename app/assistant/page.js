'use client';

import { useEffect, useMemo, useState } from 'react';
import './assistant.css';

const ASSISTANT_SIDEBAR_COLLAPSE_KEY = 'campus_assistant_sidebar_collapsed';

const courseTabs = [
    {
        id: 'learned',
        label: '我学的课',
        summary: '学生侧课程入口',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3 2 8l10 5 8-4" />
                <path d="M6 10.8V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.2" />
            </svg>
        ),
    },
    {
        id: 'taught',
        label: '我教的课',
        summary: '教学侧课程入口',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6h16v12H4z" />
                <path d="M8 6V4h8v2" />
                <path d="M8 18h8" />
                <path d="M12 10v4" />
                <path d="M10 12h4" />
            </svg>
        ),
    },
];

function fallbackCover(title = '') {
    const seed = encodeURIComponent(title || 'course');
    return `https://ui-avatars.com/api/?name=${seed}&background=E8F1FF&color=1B4FCC&bold=true&format=png&size=512`;
}

function CourseCard({ course }) {
    return (
        <a
            className="assistant-course-card glass"
            href={course.href || '#'}
            target={course.href ? '_blank' : undefined}
            rel={course.href ? 'noreferrer noopener' : undefined}
        >
            <div className="assistant-course-cover">
                <img src={course.coverUrl || fallbackCover(course.title)} alt={course.title} />
            </div>
            <div className="assistant-course-body">
                <h3>{course.title}</h3>
                <p className="assistant-course-teacher">{course.teacherName}</p>
                {course.summary ? <p className="assistant-course-summary">{course.summary}</p> : null}
            </div>
            <div className="assistant-course-footer">
                <span className="assistant-course-chip">{course.role === 'taught' ? '授课' : '学习中'}</span>
                <span className="assistant-course-link">{course.href ? '进入课程' : '等待补充链接'}</span>
            </div>
        </a>
    );
}

export default function AssistantPage() {
    const [activeTab, setActiveTab] = useState('learned');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [collections, setCollections] = useState({
        learned: [],
        taught: [],
        meta: null,
    });

    useEffect(() => {
        let disposed = false;

        const loadCourses = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await fetch('/api/assistant/courses', {
                    cache: 'no-store',
                });
                const payload = await response.json();
                if (disposed) {
                    return;
                }

                if (!payload?.ok) {
                    throw new Error(payload?.error || '课程接口返回失败。');
                }

                setCollections({
                    learned: Array.isArray(payload.learned) ? payload.learned : [],
                    taught: Array.isArray(payload.taught) ? payload.taught : [],
                    meta: payload.meta || null,
                });
            } catch (loadError) {
                if (!disposed) {
                    setError(loadError instanceof Error ? loadError.message : '课程接口请求失败。');
                    setCollections({
                        learned: [],
                        taught: [],
                        meta: null,
                    });
                }
            } finally {
                if (!disposed) {
                    setLoading(false);
                }
            }
        };

        loadCourses();
        return () => {
            disposed = true;
        };
    }, []);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(ASSISTANT_SIDEBAR_COLLAPSE_KEY);
            if (stored === '1') {
                setIsSidebarCollapsed(true);
            }
        } catch {
            // ignore restore failure
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(ASSISTANT_SIDEBAR_COLLAPSE_KEY, isSidebarCollapsed ? '1' : '0');
        } catch {
            // ignore persist failure
        }
    }, [isSidebarCollapsed]);

    const activeCourses = collections[activeTab] || [];
    const availableTabs = useMemo(() => {
        if (loading || error) {
            return courseTabs;
        }

        const resolved = courseTabs.filter((tab) => Array.isArray(collections[tab.id]) && collections[tab.id].length > 0);
        return resolved.length > 0 ? resolved : courseTabs;
    }, [collections, error, loading]);
    const shouldShowSidebar = availableTabs.length > 1;
    const currentTab = availableTabs.find((tab) => tab.id === activeTab) || availableTabs[0] || courseTabs[0];

    useEffect(() => {
        if (!availableTabs.some((tab) => tab.id === activeTab)) {
            setActiveTab(availableTabs[0]?.id || courseTabs[0].id);
        }
    }, [activeTab, availableTabs]);

    const filteredCourses = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();
        if (!keyword) {
            return collections[currentTab?.id] || [];
        }

        return (collections[currentTab?.id] || []).filter((course) => (
            [course.title, course.teacherName, course.summary]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(keyword))
        ));
    }, [collections, currentTab?.id, searchText]);

    return (
        <main className="assistant-workspace">
            {shouldShowSidebar ? (
                <aside className={`assistant-sidebar glass-strong ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                    <div className="assistant-sidebar-header">
                        {!isSidebarCollapsed ? (
                            <div className="assistant-sidebar-header-copy">
                                <h2>
                                    <span className="assistant-sidebar-accent">AI</span>
                                    <span>助教空间</span>
                                </h2>
                                <p>课程入口、教学协同与后续助教能力统一放在这里。</p>
                            </div>
                        ) : null}
                        <div className="assistant-sidebar-actions">
                            <button
                                className="assistant-toggle-btn"
                                type="button"
                                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                                title={isSidebarCollapsed ? '展开边栏' : '收起边栏'}
                            >
                                {isSidebarCollapsed ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M9 6l6 6-6 6" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M15 6l-6 6 6 6" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="assistant-nav-list">
                        {availableTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`assistant-nav-item ${currentTab.id === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                                title={isSidebarCollapsed ? tab.label : undefined}
                            >
                                <span className="assistant-nav-icon">{tab.icon}</span>
                                {!isSidebarCollapsed ? (
                                    <span className="assistant-nav-copy">
                                        <strong>{tab.label}</strong>
                                        <small>{tab.summary}</small>
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </div>

                    {!isSidebarCollapsed ? (
                        <div className="assistant-sidebar-footer">
                            <div className="assistant-sidebar-card">
                                <small>当前区域</small>
                                <strong>{currentTab.label}</strong>
                                <p>系统会根据接口动态判断角色身份。只有同时存在学生和教师两个入口时，左侧才保留切换。</p>
                            </div>
                        </div>
                    ) : null}
                </aside>
            ) : null}

            <section className="assistant-content">
                <div className="assistant-content-scroll">
                    <div className="assistant-shell">
                        <section className="assistant-hero glass-strong">
                            <div className="assistant-hero-copy">
                                <span className="assistant-kicker">AI Tutor</span>
                                <h1>{currentTab.label}</h1>
                                <p>页面结构已经和 `AI 办事 / AI 科研 / AI 图书馆` 对齐。左侧保留可折叠功能栏，右侧作为课程内容工作区，后面你继续给接口时我只需要补数据渲染。</p>
                            </div>
                            <div className="assistant-hero-stats">
                                <div className="assistant-stat glass">
                                    <small>我学的课</small>
                                    <strong>{collections.learned.length}</strong>
                                </div>
                                <div className="assistant-stat glass">
                                    <small>我教的课</small>
                                    <strong>{collections.taught.length}</strong>
                                </div>
                            </div>
                        </section>

                        <section className="assistant-toolbar glass">
                            <div className="assistant-current-tab">
                                <span>{currentTab.summary}</span>
                                <strong>{currentTab.label}</strong>
                            </div>
                            <label className="assistant-search">
                                <input
                                    type="search"
                                    placeholder="搜索课程名称、教师或说明"
                                    value={searchText}
                                    onChange={(event) => setSearchText(event.target.value)}
                                />
                            </label>
                        </section>

                        {collections.meta ? (
                            <section className="assistant-meta glass">
                                <span>签名策略</span>
                                <strong>{activeTab === 'learned' ? collections.meta.learnedStrategy : collections.meta.taughtStrategy}</strong>
                            </section>
                        ) : null}

                        {error ? (
                            <section className="assistant-feedback error">
                                <strong>课程接口暂时没有取到数据</strong>
                                <p>{error}</p>
                            </section>
                        ) : null}

                        {loading ? (
                            <section className="assistant-loading glass">
                                <div className="assistant-spinner" />
                                <p>正在同步课程列表…</p>
                            </section>
                        ) : null}

                        {!loading && !error && filteredCourses.length === 0 ? (
                            <section className="assistant-empty glass">
                                <strong>{activeTab === 'learned' ? '我学的课' : '我教的课'}暂无可展示课程</strong>
                                <p>右侧区域已经预留好课程内容布局，后续你给真实接口或数据后，我会继续在这里渲染完整列表和点击跳转。</p>
                            </section>
                        ) : null}

                        {!loading && filteredCourses.length > 0 ? (
                            <section className="assistant-grid">
                                {filteredCourses.map((course) => (
                                    <CourseCard key={`${activeTab}-${course.id}`} course={course} />
                                ))}
                            </section>
                        ) : null}
                    </div>
                </div>
            </section>
        </main>
    );
}
