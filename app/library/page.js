'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    borrowedItems,
    libraryCollections,
    libraryDatabases,
    libraryItems,
    libraryTasks,
    readingHistory,
} from '@/data/library';
import './library.css';

const typeLabels = {
    book: '图书',
    paper: '论文',
    report: '报告',
};

export default function LibraryPage() {
    const [activeCollection, setActiveCollection] = useState('search');
    const [query, setQuery] = useState('');
    const [selectedItemId, setSelectedItemId] = useState(libraryItems[0].id);
    const [note, setNote] = useState('');
    const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('library_note');
            if (stored) {
                setNote(stored);
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('library_note', note);
        } catch {
            // ignore
        }
    }, [note]);

    const filteredItems = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return libraryItems.filter((item) => {
            if (showOnlyAvailable && !item.availability.includes('可借') && !item.availability.includes('全文在线')) {
                return false;
            }

            if (!keyword) {
                return true;
            }

            return (
                item.title.toLowerCase().includes(keyword)
                || item.subtitle.toLowerCase().includes(keyword)
                || item.authors.join(' ').toLowerCase().includes(keyword)
                || item.tags.join(' ').toLowerCase().includes(keyword)
                || item.abstract.toLowerCase().includes(keyword)
            );
        });
    }, [query, showOnlyAvailable]);

    const selectedItem = filteredItems.find((item) => item.id === selectedItemId) || filteredItems[0] || libraryItems[0];

    useEffect(() => {
        if (selectedItem && selectedItem.id !== selectedItemId) {
            setSelectedItemId(selectedItem.id);
        }
    }, [selectedItem, selectedItemId]);

    const handoffHref = (prompt) => `/?firefly_prompt=${encodeURIComponent(prompt)}&firefly_caps=library`;

    return (
        <div className="library-page">
            <aside className="library-nav glass-strong">
                <div className="library-nav-head">
                    <span className="library-kicker">AI 图书馆</span>
                    <h1>阅读与知识服务</h1>
                    <p>把馆藏、论文、阅读笔记和萤火虫联成一个工作面。</p>
                </div>

                <div className="library-nav-list">
                    {libraryCollections.map((collection) => (
                        <button
                            key={collection.id}
                            type="button"
                            className={`library-nav-item ${activeCollection === collection.id ? 'active' : ''}`}
                            onClick={() => setActiveCollection(collection.id)}
                        >
                            <strong>{collection.label}</strong>
                            <span>{collection.desc}</span>
                        </button>
                    ))}
                </div>

                <div className="library-side-card">
                    <span className="library-side-label">在借与提醒</span>
                    {borrowedItems.map((item) => (
                        <div key={item.id} className="library-side-row">
                            <strong>{item.title}</strong>
                            <span>{item.status} · {item.due}</span>
                        </div>
                    ))}
                </div>
            </aside>

            <main className="library-main">
                <div className="library-toolbar glass">
                    <div className="library-search">
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="搜索图书、论文、作者、主题词"
                        />
                    </div>
                    <label className="library-toggle">
                        <input
                            type="checkbox"
                            checked={showOnlyAvailable}
                            onChange={(event) => setShowOnlyAvailable(event.target.checked)}
                        />
                        仅看可借/可访问
                    </label>
                    <Link href={handoffHref(`请作为 AI 图书馆 助手，先帮我检索并整理与“${query || selectedItem.title}”相关的阅读建议和检索路径。`)} className="library-firefly-link">
                        交给萤火虫
                    </Link>
                </div>

                <div className="library-shell">
                    {activeCollection === 'search' && (
                        <>
                            <section className="library-results glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">智能搜索</span>
                                        <h2>{filteredItems.length} 条资料</h2>
                                    </div>
                                    <span className="library-section-meta">当前模式：智能检索</span>
                                </div>

                                <div className="library-result-list">
                                    {filteredItems.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`library-result-card ${selectedItem?.id === item.id ? 'active' : ''}`}
                                            onClick={() => setSelectedItemId(item.id)}
                                        >
                                            <div className="library-result-top">
                                                <span className="library-result-type">{typeLabels[item.type]}</span>
                                                <span className="library-result-status">{item.availability}</span>
                                            </div>
                                            <strong>{item.title}</strong>
                                            <p>{item.subtitle}</p>
                                            <div className="library-result-meta">
                                                <span>{item.authors.join(' / ')}</span>
                                                <span>{item.year}</span>
                                            </div>
                                            <div className="library-result-tags">
                                                {item.tags.map((tag) => (
                                                    <span key={tag}>{tag}</span>
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="library-detail glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">资料详情</span>
                                        <h2>{selectedItem.title}</h2>
                                    </div>
                                    <span className="library-section-meta">{selectedItem.source}</span>
                                </div>

                                <div className="library-detail-card">
                                    <div className="library-detail-meta">
                                        <span>作者：{selectedItem.authors.join(' / ')}</span>
                                        <span>索书号：{selectedItem.callNo}</span>
                                        <span>位置：{selectedItem.location}</span>
                                    </div>

                                    <p className="library-abstract">{selectedItem.abstract}</p>

                                    <div className="library-highlight-list">
                                        {selectedItem.highlights.map((highlight) => (
                                            <div key={highlight} className="library-highlight-item">
                                                {highlight}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="library-citation">
                                        <span className="library-section-kicker">推荐引用</span>
                                        <div>{selectedItem.citation}</div>
                                    </div>
                                </div>
                            </section>
                        </>
                    )}

                    {activeCollection === 'plaza' && (
                        <>
                            <section className="library-results glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">图书广场</span>
                                        <h2>个性化推荐</h2>
                                    </div>
                                    <span className="library-section-meta">推荐与发现</span>
                                </div>
                                <div className="library-result-list">
                                    {libraryItems.map((item) => (
                                        <button key={item.id} type="button" className="library-result-card" onClick={() => { setSelectedItemId(item.id); setActiveCollection('reading'); }}>
                                            <div className="library-result-top">
                                                <span className="library-result-type">{typeLabels[item.type]}</span>
                                                <span className="library-result-status">{item.availability}</span>
                                            </div>
                                            <strong>{item.title}</strong>
                                            <p>{item.subtitle}</p>
                                            <div className="library-result-tags">
                                                {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="library-detail glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">推荐理由</span>
                                        <h2>{selectedItem.title}</h2>
                                    </div>
                                    <span className="library-section-meta">{selectedItem.availability}</span>
                                </div>
                                <div className="library-detail-card">
                                    <p className="library-abstract">{selectedItem.abstract}</p>
                                    <div className="library-highlight-list">
                                        {selectedItem.highlights.map((highlight) => (
                                            <div key={highlight} className="library-highlight-item">
                                                {highlight}
                                            </div>
                                        ))}
                                    </div>
                                    <Link href={handoffHref(`请基于当前图书广场推荐《${selectedItem.title}》帮我说明这本资料为什么值得阅读，并生成一个 3 步阅读任务。`)} className="library-firefly-link secondary">
                                        推荐交给萤火虫
                                    </Link>
                                </div>
                            </section>
                        </>
                    )}

                    {activeCollection === 'reading' && (
                        <>
                            <section className="library-results glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">阅读</span>
                                        <h2>{selectedItem.title}</h2>
                                    </div>
                                    <span className="library-section-meta">AI 助手 / 笔记辅助</span>
                                </div>
                                <div className="library-reading-card">
                                    <div className="library-reading-toolbar">
                                        <button type="button" className="library-reading-chip active">AI 助手</button>
                                        <button type="button" className="library-reading-chip">笔记辅助</button>
                                        <button type="button" className="library-reading-chip">沉浸阅读</button>
                                    </div>
                                    <div className="library-reading-content">
                                        <h3>{selectedItem.subtitle}</h3>
                                        <p>{selectedItem.abstract}</p>
                                        <p>{selectedItem.highlights.join('；')}</p>
                                    </div>
                                </div>
                            </section>

                            <section className="library-detail glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">笔记辅助</span>
                                        <h2>阅读协作</h2>
                                    </div>
                                </div>
                                <div className="library-detail-card">
                                    <div className="library-highlight-list">
                                        {libraryTasks.map((task) => (
                                            <Link
                                                key={task.id}
                                                href={handoffHref(`${task.prompt}\n\n当前阅读材料：${selectedItem.title} / ${selectedItem.citation}`)}
                                                className="library-action-card"
                                            >
                                                <strong>{task.title}</strong>
                                                <span>{task.desc}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </>
                    )}

                    {activeCollection === 'space' && (
                        <>
                            <section className="library-results glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">个人空间</span>
                                        <h2>我的书架</h2>
                                    </div>
                                </div>
                                <div className="library-result-list">
                                    {borrowedItems.map((item) => (
                                        <div key={item.id} className="library-result-card static">
                                            <strong>{item.title}</strong>
                                            <p>{item.status}</p>
                                            <div className="library-result-meta">
                                                <span>到期时间</span>
                                                <span>{item.due}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="library-detail glass-strong">
                                <div className="library-section-head">
                                    <div>
                                        <span className="library-section-kicker">阅读记录</span>
                                        <h2>我的笔记与进度</h2>
                                    </div>
                                </div>
                                <div className="library-detail-card">
                                    {readingHistory.map((item) => (
                                        <div key={item.id} className="library-history-item">
                                            <strong>{item.title}</strong>
                                            <span>{item.progress}</span>
                                            <small>{item.updatedAt}</small>
                                        </div>
                                    ))}
                                    <div className="library-note-card inline">
                                        <span className="library-section-kicker">我的笔记</span>
                                        <textarea
                                            value={note}
                                            onChange={(event) => setNote(event.target.value)}
                                            placeholder="把阅读中需要交给萤火虫继续处理的线索记在这里"
                                        />
                                    </div>
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </main>

            <aside className="library-assistant glass-strong">
                <div className="library-section-head">
                    <div>
                        <span className="library-section-kicker">萤火虫联动</span>
                        <h2>研读工作台</h2>
                    </div>
                </div>

                <div className="library-firefly-actions">
                    <Link href={handoffHref(selectedItem.fireflyPrompt)} className="library-action-card">
                        <strong>交给萤火虫拆解</strong>
                        <span>围绕当前资料生成结构化阅读或研究任务</span>
                    </Link>
                    {libraryTasks.map((task) => (
                        <Link
                            key={task.id}
                            href={handoffHref(`${task.prompt}\n\n当前资料：${selectedItem.title} / ${selectedItem.citation}`)}
                            className="library-action-card"
                        >
                            <strong>{task.title}</strong>
                            <span>{task.desc}</span>
                        </Link>
                    ))}
                </div>

                <div className="library-note-card">
                    <span className="library-section-kicker">我的笔记</span>
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="把阅读中需要交给萤火虫继续处理的线索记在这里"
                    />
                    <Link
                        href={handoffHref(`请基于我的图书馆笔记继续推进，并把这些阅读线索转成结构化任务：\n${note || '暂无笔记'}`)}
                        className="library-firefly-link secondary"
                    >
                        笔记交给萤火虫
                    </Link>
                </div>

                <div className="library-database-card">
                    <span className="library-section-kicker">数据库入口</span>
                    <div className="library-database-list">
                        {libraryDatabases.map((database) => (
                            <a key={database.id} href={database.href} target="_blank" rel="noreferrer" className="library-db-link">
                                <strong>{database.name}</strong>
                                <span>{database.desc}</span>
                            </a>
                        ))}
                    </div>
                </div>
            </aside>
        </div>
    );
}
