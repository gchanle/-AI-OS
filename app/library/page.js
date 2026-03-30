'use client';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import FireflySideDrawer from '@/components/FireflySideDrawer';
import { buildFireflyHandoffHref } from '@/data/campusPlatform';
import { defaultChatModelId, resolveChatModel } from '@/data/workspace';
import {
    libraryAssistantShortcuts,
    libraryBooks,
    libraryBorrowRecords,
    libraryCampusConnectors,
    libraryCatalogResults,
    libraryFeaturedCollections,
    libraryGenres,
    libraryStarterNotes,
    libraryStarterReadingState,
    libraryStarterShelfIds,
    libraryViews,
} from '@/data/library';
import './library.css';

const STORAGE_KEYS = {
    view: 'library_view_v2',
    selectedBook: 'library_selected_book_v2',
    shelf: 'library_shelf_v2',
    reading: 'library_reading_state_v2',
    notes: 'library_notes_v2',
    activity: 'library_activity_v2',
    railCollapsed: 'library_left_rail_collapsed_v1',
};

const READING_MINUTES_PER_PAGE = 18;
const STARTER_ACTIVITY_LOG = [
    { id: 'activity-1', type: 'page-turn', bookId: 'campus-ai-report', at: '2026-03-26T02:18:00.000Z', pageTitle: '高校场景的关键差异在于真实馆藏和借阅系统' },
    { id: 'activity-2', type: 'note-save', bookId: 'campus-ai-report', at: '2026-03-25T11:55:00.000Z', pageTitle: '为什么 AI 图书馆 不能只做检索' },
    { id: 'activity-3', type: 'page-turn', bookId: 'prml-book', at: '2026-03-25T13:05:00.000Z', pageTitle: '为什么概率视角是这本书的核心入口' },
    { id: 'activity-4', type: 'open', bookId: 'human-stars', at: '2026-03-24T08:20:00.000Z', pageTitle: '序章：关键时刻不是宏大叙事，而是短暂窗口' },
];

const libraryViewIcons = {
    plaza: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-5 9 5v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>,
    shelf: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h4v16H5z" /><path d="M10 4h4v16h-4z" /><path d="M15 4h4v16h-4z" /></svg>,
    reader: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    notes: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></svg>,
    stats: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-8" /><path d="M22 20v-4" /></svg>,
    connectors: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 12h8" /><path d="M12 8v8" /><circle cx="12" cy="12" r="9" /></svg>,
};

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripHtml(input = '') {
    return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesKeyword(keyword, ...parts) {
    if (!keyword) {
        return true;
    }

    return parts
        .flat()
        .filter(Boolean)
        .map((part) => String(part).toLowerCase())
        .join(' ')
        .includes(keyword);
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
    });
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function describeActivity(item) {
    switch (item.type) {
    case 'open':
        return item.pageTitle ? `打开阅读器 · ${item.pageTitle}` : '打开阅读器';
    case 'page-turn':
        return item.pageTitle ? `阅读推进 · ${item.pageTitle}` : '翻页阅读';
    case 'note-create':
        return item.pageTitle ? `新建笔记 · ${item.pageTitle}` : '新建笔记';
    case 'note-save':
        return item.pageTitle ? `保存笔记 · ${item.pageTitle}` : '保存笔记';
    case 'shelf-add':
        return '加入书架';
    case 'shelf-remove':
        return '移出书架';
    case 'assistant-ask':
        return item.pageTitle ? `陪读提问 · ${item.pageTitle}` : '发起陪读提问';
    case 'source-open':
        return item.pageTitle || '打开免费原书';
    default:
        return item.pageTitle || '工作面操作';
    }
}

function buildLibraryContextMessage(snapshot, question) {
    return [
        '你现在在 AI 图书馆 里充当萤火虫协同助手，请只围绕当前图书馆上下文回答。',
        `当前视图：${snapshot.viewLabel}`,
        `当前图书：${snapshot.bookTitle}`,
        `作者：${snapshot.bookAuthor}`,
        `阅读进度：${snapshot.readingProgress}`,
        snapshot.pageQuote ? `当前引文：${snapshot.pageQuote}` : '',
        snapshot.noteTitle ? `当前笔记：${snapshot.noteTitle}` : '',
        snapshot.noteQuote ? `当前笔记摘录：${snapshot.noteQuote}` : '',
        `当前页内容：${snapshot.pageBody}`,
        snapshot.noteContent ? `当前笔记内容：${snapshot.noteContent}` : '',
        `图书概要：${snapshot.bookSummary}`,
        `用户问题：${question}`,
        '请优先解释、梳理和推进当前阅读/笔记任务，再给继续阅读、记笔记或延伸阅读建议，语气克制、清晰、专业。',
    ].filter(Boolean).join('\n');
}

function buildFallbackLibraryReply(snapshot, question) {
    if (question.includes('总结') || question.includes('摘要')) {
        return `如果先做一个克制版总结，当前这段内容最核心的是“${snapshot.pageTitle || snapshot.noteTitle || snapshot.bookTitle}”。更值得抓的是两层信息：它正在解释什么问题，以及它希望你带走什么阅读方法。结合当前上下文，最值得记住的线索是：${snapshot.noteQuote || snapshot.pageQuote || snapshot.bookSummary}`;
    }

    if (question.includes('难') || question.includes('不懂') || question.includes('解释')) {
        return `如果把当前内容换成更口语的说法，它其实在回答一个非常具体的问题：为什么“${snapshot.pageTitle || snapshot.noteTitle || snapshot.bookTitle}”值得被单独拿出来理解。你可以先只记住一句话：${snapshot.noteQuote || snapshot.pageQuote || snapshot.bookSummary}。先抓住这句，再回头看细节会轻松很多。`;
    }

    if (question.includes('笔记') || question.includes('摘录')) {
        return `可以先把当前内容整理成一条阅读笔记：\n1. 主题是“${snapshot.pageTitle || snapshot.noteTitle || snapshot.bookTitle}”\n2. 关键引文是“${snapshot.noteQuote || snapshot.pageQuote || snapshot.bookSummary}”\n3. 你的理解可以围绕“它解释了什么问题、能迁移到什么场景”来写。`;
    }

    if (question.includes('任务') || question.includes('下一步')) {
        return `基于当前图书馆上下文，建议你接下来做三件事：\n1. 用自己的话复述“${snapshot.pageTitle || snapshot.noteTitle || snapshot.bookTitle}”在回答什么问题。\n2. 把“${snapshot.noteQuote || snapshot.pageQuote || snapshot.bookSummary}”转成一条笔记。\n3. 再决定是继续往后读、补充笔记，还是把问题交给萤火虫整理成后续任务。`;
    }

    return `我会先把问题收回到当前阅读语境里看：这本书当前关注的是“${snapshot.pageTitle || snapshot.noteTitle || snapshot.bookTitle}”，核心线索是“${snapshot.noteQuote || snapshot.pageQuote || snapshot.bookSummary}”。如果你愿意，下一步可以继续追问“这段内容真正想说明什么”或者“它和整本书主线是什么关系”，这样更容易读进去。`;
}

function buildStreak(activityLog) {
    const days = new Set(
        activityLog.map((item) => {
            const date = new Date(item.at);
            if (Number.isNaN(date.getTime())) {
                return null;
            }

            return date.toISOString().slice(0, 10);
        }).filter(Boolean)
    );

    if (days.size === 0) {
        return 0;
    }

    let streak = 0;
    const cursor = new Date();

    while (true) {
        const key = cursor.toISOString().slice(0, 10);
        if (!days.has(key)) {
            break;
        }

        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

function buildMonthlyActivity(activityLog) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('zh-CN', { month: 'short' });
    const buckets = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
        return {
            key: `${date.getFullYear()}-${date.getMonth() + 1}`,
            label: formatter.format(date),
            count: 0,
        };
    });

    const bucketMap = Object.fromEntries(buckets.map((item) => [item.key, item]));
    activityLog.forEach((item) => {
        const date = new Date(item.at);
        if (Number.isNaN(date.getTime())) {
            return;
        }

        const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
        if (bucketMap[key]) {
            bucketMap[key].count += 1;
        }
    });

    const maxCount = Math.max(...buckets.map((item) => item.count), 1);
    return buckets.map((item) => ({
        ...item,
        ratio: item.count / maxCount,
    }));
}

function buildGenreDistribution(books) {
    return libraryGenres
        .filter((genre) => genre !== '全部')
        .map((genre) => ({
            genre,
            count: books.filter((book) => book.genre === genre).length,
        }))
        .filter((item) => item.count > 0);
}

export default function LibraryPage() {
    const [hasRestoredState, setHasRestoredState] = useState(false);
    const [activeView, setActiveView] = useState('plaza');
    const [viewQueries, setViewQueries] = useState(() => (
        Object.fromEntries(libraryViews.map((view) => [view.id, '']))
    ));
    const [isRailCollapsed, setIsRailCollapsed] = useState(false);
    const [isFireflyDrawerOpen, setIsFireflyDrawerOpen] = useState(false);
    const [isReaderIndexCollapsed, setIsReaderIndexCollapsed] = useState(false);
    const [selectedGenre, setSelectedGenre] = useState('全部');
    const [selectedBookId, setSelectedBookId] = useState(libraryBooks[0]?.id || '');
    const [shelfIds, setShelfIds] = useState(libraryStarterShelfIds);
    const [readingState, setReadingState] = useState(libraryStarterReadingState);
    const [notes, setNotes] = useState(libraryStarterNotes);
    const [activeNoteId, setActiveNoteId] = useState(libraryStarterNotes[0]?.id || null);
    const [activityLog, setActivityLog] = useState(STARTER_ACTIVITY_LOG);
    const [feedbackToast, setFeedbackToast] = useState(null);
    const [draftNoteTitle, setDraftNoteTitle] = useState('');
    const [draftNoteContent, setDraftNoteContent] = useState('');
    const [draftNoteQuote, setDraftNoteQuote] = useState('');
    const [draftNotePageTitle, setDraftNotePageTitle] = useState('');
    const noteEditorRef = useRef(null);
    const activeQuery = viewQueries[activeView] || '';
    const deferredQuery = useDeferredValue(activeQuery);

    useEffect(() => {
        setIsFireflyDrawerOpen(false);
    }, []);

    const booksById = useMemo(
        () => Object.fromEntries(libraryBooks.map((book) => [book.id, book])),
        []
    );

    const setViewQuery = (viewId, nextValue) => {
        setViewQueries((prev) => ({
            ...prev,
            [viewId]: nextValue,
        }));
    };

    const pushToast = (message, tone = 'success') => {
        setFeedbackToast({
            id: uid('toast'),
            message,
            tone,
        });
    };

    const clearViewQuery = (viewId = activeView) => {
        setViewQuery(viewId, '');
    };

    useEffect(() => {
        try {
            const storedView = localStorage.getItem(STORAGE_KEYS.view);
            const storedSelectedBookId = localStorage.getItem(STORAGE_KEYS.selectedBook);
            const storedShelfIds = JSON.parse(localStorage.getItem(STORAGE_KEYS.shelf) || 'null');
            const storedReadingState = JSON.parse(localStorage.getItem(STORAGE_KEYS.reading) || 'null');
            const storedNotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.notes) || 'null');
            const storedActivity = JSON.parse(localStorage.getItem(STORAGE_KEYS.activity) || 'null');
            const storedRailCollapsed = localStorage.getItem(STORAGE_KEYS.railCollapsed);

            if (storedView && libraryViews.some((view) => view.id === storedView)) {
                setActiveView(storedView);
            }

            if (storedSelectedBookId && booksById[storedSelectedBookId]) {
                setSelectedBookId(storedSelectedBookId);
            }

            if (Array.isArray(storedShelfIds) && storedShelfIds.length > 0) {
                setShelfIds(storedShelfIds.filter((id) => booksById[id]));
            }

            if (storedReadingState && typeof storedReadingState === 'object') {
                setReadingState(storedReadingState);
            }

            if (Array.isArray(storedNotes) && storedNotes.length > 0) {
                setNotes(storedNotes);
                setActiveNoteId(storedNotes[0].id);
            }

            if (Array.isArray(storedActivity) && storedActivity.length > 0) {
                setActivityLog(storedActivity);
            }

            if (storedRailCollapsed !== null) {
                setIsRailCollapsed(storedRailCollapsed === '1');
            }
        } catch (error) {
            console.error('Failed to restore library workspace state:', error);
        } finally {
            setHasRestoredState(true);
        }
    }, [booksById]);

    useEffect(() => {
        if (!hasRestoredState) {
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEYS.view, activeView);
            localStorage.setItem(STORAGE_KEYS.selectedBook, selectedBookId);
            localStorage.setItem(STORAGE_KEYS.shelf, JSON.stringify(shelfIds));
            localStorage.setItem(STORAGE_KEYS.reading, JSON.stringify(readingState));
            localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
            localStorage.setItem(STORAGE_KEYS.activity, JSON.stringify(activityLog));
            localStorage.setItem(STORAGE_KEYS.railCollapsed, isRailCollapsed ? '1' : '0');
        } catch (error) {
            console.error('Failed to persist library workspace state:', error);
        }
    }, [activeView, selectedBookId, shelfIds, readingState, notes, activityLog, isRailCollapsed, hasRestoredState]);

    useEffect(() => {
        if (!feedbackToast) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            setFeedbackToast(null);
        }, 2600);

        return () => window.clearTimeout(timeoutId);
    }, [feedbackToast]);

    const filteredBooks = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        return libraryBooks.filter((book) => {
            if (selectedGenre !== '全部' && book.genre !== selectedGenre) {
                return false;
            }

            return matchesKeyword(
                keyword,
                book.title,
                book.subtitle,
                book.author,
                book.tags,
                book.summary,
                book.recommendation
            );
        });
    }, [deferredQuery, selectedGenre]);

    const activeViewConfig = libraryViews.find((view) => view.id === activeView);
    const selectedBook = booksById[selectedBookId] || filteredBooks[0] || libraryBooks[0];
    const selectedReadingState = readingState[selectedBook?.id] || {
        pageIndex: 0,
        minutes: 0,
        startedAt: null,
        lastReadAt: null,
        completedAt: null,
    };
    const currentPageIndex = selectedBook
        ? clamp(selectedReadingState.pageIndex || 0, 0, selectedBook.pages.length - 1)
        : 0;
    const currentPage = selectedBook?.pages[currentPageIndex];
    const shelfBooks = shelfIds.map((id) => booksById[id]).filter(Boolean);
    const activeNote = notes.find((note) => note.id === activeNoteId) || notes[0] || null;
    const featuredBook = filteredBooks[0] || (deferredQuery.trim() ? null : selectedBook);
    const selectedBookProgress = selectedBook
        ? Math.round(((currentPageIndex + 1) / selectedBook.pages.length) * 100)
        : 0;
    const assistantContextSnapshot = useMemo(() => ({
        viewId: activeView,
        viewLabel: activeViewConfig?.label || 'AI 图书馆',
        bookId: selectedBook?.id || '',
        bookTitle: selectedBook?.title || 'AI 图书馆',
        bookAuthor: selectedBook?.author || '未选择图书',
        bookSummary: selectedBook?.summary || '当前没有明确图书上下文。',
        pageTitle: currentPage?.title || selectedBook?.pages?.[0]?.title || '未定位到具体页',
        pageQuote: currentPage?.quote || '',
        pageBody: currentPage?.body?.join('\n') || selectedBook?.summary || '',
        noteTitle: activeView === 'notes' ? activeNote?.title || '' : '',
        noteQuote: activeView === 'notes' ? activeNote?.quote || '' : '',
        noteContent: activeView === 'notes' && activeNote ? stripHtml(activeNote.contentHtml) : '',
        readingProgress: `${selectedBookProgress}% · 累计 ${selectedReadingState.minutes || 0} 分钟`,
    }), [
        activeNote,
        activeView,
        activeViewConfig,
        currentPage,
        selectedBook,
        selectedBookProgress,
        selectedReadingState.minutes,
    ]);

    const filteredNotes = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        if (!keyword) {
            return notes;
        }

        return notes.filter((note) => matchesKeyword(
            keyword,
            note.title,
            note.bookTitle,
            note.pageTitle,
            note.quote,
            stripHtml(note.contentHtml)
        ));
    }, [notes, deferredQuery]);

    const filteredShelfBooks = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        return shelfBooks.filter((book) => matchesKeyword(
            keyword,
            book.title,
            book.subtitle,
            book.author,
            book.genre,
            book.tags,
            book.summary,
            book.recommendation
        ));
    }, [deferredQuery, shelfBooks]);

    const catalogMatches = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        if (!keyword) {
            return libraryCatalogResults;
        }

        return libraryCatalogResults.filter((item) => matchesKeyword(
            keyword,
            item.title,
            item.type,
            item.source,
            item.status,
            item.location,
            item.tags
        ));
    }, [deferredQuery]);

    const monthlyActivity = useMemo(() => buildMonthlyActivity(activityLog), [activityLog]);
    const totalMinutes = useMemo(
        () => Object.values(readingState).reduce((sum, item) => sum + (item.minutes || 0), 0),
        [readingState]
    );
    const totalCompletedBooks = useMemo(
        () => Object.entries(readingState).reduce((sum, [bookId, item]) => {
            const book = booksById[bookId];
            if (!book) {
                return sum;
            }

            const completed = item.completedAt || item.pageIndex >= book.pages.length - 1;
            return sum + (completed ? 1 : 0);
        }, 0),
        [booksById, readingState]
    );
    const currentYear = new Date().getFullYear();
    const yearlyBooks = useMemo(
        () => Object.values(readingState).reduce((sum, item) => {
            const date = new Date(item.lastReadAt || item.startedAt || 0);
            if (!Number.isNaN(date.getTime()) && date.getFullYear() === currentYear) {
                return sum + 1;
            }
            return sum;
        }, 0),
        [currentYear, readingState]
    );
    const genreDistribution = useMemo(
        () => buildGenreDistribution(shelfBooks),
        [shelfBooks]
    );
    const readingStreak = useMemo(() => buildStreak(activityLog), [activityLog]);
    const featuredCollections = useMemo(
        () => libraryFeaturedCollections.map((collection) => ({
            ...collection,
            books: collection.bookIds.map((id) => booksById[id]).filter(Boolean),
        })),
        [booksById]
    );
    const filteredFeaturedCollections = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        if (!keyword) {
            return featuredCollections;
        }

        return featuredCollections
            .map((collection) => ({
                ...collection,
                books: collection.books.filter((book) => matchesKeyword(
                    keyword,
                    book.title,
                    book.subtitle,
                    book.author,
                    book.tags,
                    book.summary,
                    book.recommendation
                )),
            }))
            .filter((collection) => collection.books.length > 0);
    }, [deferredQuery, featuredCollections]);
    const latestActivity = useMemo(
        () => activityLog.slice(0, 6).map((item) => ({
            ...item,
            bookTitle: booksById[item.bookId]?.title || '未知图书',
            summary: describeActivity(item),
        })),
        [activityLog, booksById]
    );
    const filteredLatestActivity = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        return latestActivity.filter((item) => matchesKeyword(
            keyword,
            item.bookTitle,
            item.pageTitle,
            item.summary,
            item.type
        ));
    }, [deferredQuery, latestActivity]);
    const filteredReaderBooks = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        if (!keyword) {
            return [];
        }

        return libraryBooks
            .filter((book) => book.id !== selectedBook?.id)
            .filter((book) => matchesKeyword(
                keyword,
                book.title,
                book.subtitle,
                book.author,
                book.genre,
                book.tags,
                book.summary
            ))
            .slice(0, 6);
    }, [deferredQuery, selectedBook]);
    const filteredBorrowRecords = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        return libraryBorrowRecords.filter((item) => matchesKeyword(
            keyword,
            item.title,
            item.status,
            item.source,
            item.dueDate
        ));
    }, [deferredQuery]);
    const filteredConnectors = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        return libraryCampusConnectors.filter((connector) => matchesKeyword(
            keyword,
            connector.name,
            connector.status,
            connector.scope,
            connector.detail
        ));
    }, [deferredQuery]);
    const trackedBooks = useMemo(() => (
        Object.entries(readingState)
            .map(([bookId, item]) => {
                const book = booksById[bookId];
                if (!book) {
                    return null;
                }

                const pageIndex = clamp(item.pageIndex || 0, 0, book.pages.length - 1);
                return {
                    book,
                    minutes: item.minutes || 0,
                    lastReadAt: item.lastReadAt || item.startedAt || null,
                    progress: Math.round(((pageIndex + 1) / book.pages.length) * 100),
                };
            })
            .filter(Boolean)
            .sort((left, right) => {
                const leftTime = new Date(left.lastReadAt || 0).getTime();
                const rightTime = new Date(right.lastReadAt || 0).getTime();
                return rightTime - leftTime;
            })
    ), [booksById, readingState]);
    const filteredTrackedBooks = useMemo(() => {
        const keyword = deferredQuery.trim().toLowerCase();
        return trackedBooks.filter((item) => matchesKeyword(
            keyword,
            item.book.title,
            item.book.author,
            item.book.genre,
            item.book.tags
        ));
    }, [deferredQuery, trackedBooks]);

    useEffect(() => {
        if (!selectedBook && libraryBooks[0]) {
            setSelectedBookId(libraryBooks[0].id);
        }
    }, [selectedBook]);

    useEffect(() => {
        if (!notes.length) {
            setActiveNoteId(null);
            return;
        }

        if (!notes.some((note) => note.id === activeNoteId)) {
            setActiveNoteId(notes[0].id);
        }
    }, [notes, activeNoteId]);

    useEffect(() => {
        if (activeView !== 'notes') {
            return;
        }

        if (!filteredNotes.length) {
            return;
        }

        if (!filteredNotes.some((note) => note.id === activeNoteId)) {
            setActiveNoteId(filteredNotes[0].id);
        }
    }, [activeView, filteredNotes, activeNoteId]);

    useEffect(() => {
        if (!activeNote) {
            setDraftNoteTitle('');
            setDraftNoteContent('');
            setDraftNoteQuote('');
            setDraftNotePageTitle('');
            if (noteEditorRef.current) {
                noteEditorRef.current.innerHTML = '';
            }
            return;
        }

        setDraftNoteTitle(activeNote.title);
        setDraftNoteContent(activeNote.contentHtml);
        setDraftNoteQuote(activeNote.quote);
        setDraftNotePageTitle(activeNote.pageTitle);
    }, [activeNote]);

    useEffect(() => {
        if (noteEditorRef.current && noteEditorRef.current.innerHTML !== draftNoteContent) {
            noteEditorRef.current.innerHTML = draftNoteContent || '';
        }
    }, [draftNoteContent, activeNoteId]);

    const recordActivity = (type, bookId, extra = {}) => {
        setActivityLog((prev) => [
            {
                id: uid('activity'),
                type,
                bookId,
                at: new Date().toISOString(),
                ...extra,
            },
            ...prev,
        ].slice(0, 240));
    };

    const handoffHref = (prompt) => buildFireflyHandoffHref(prompt, ['library']);

    const ensureBookOnShelf = (bookId) => {
        let added = false;
        setShelfIds((prev) => {
            if (prev.includes(bookId)) {
                return prev;
            }

            added = true;
            return [bookId, ...prev];
        });

        return added;
    };

    const openBookResource = (book, source = '免费原书') => {
        if (!book?.resourceUrl) {
            return;
        }

        window.open(book.resourceUrl, '_blank', 'noopener,noreferrer');
        recordActivity('source-open', book.id, { pageTitle: `${source} · ${book.resourceLabel || '开放资源'}` });
        pushToast(`已打开《${book.title}》的${source}`, 'info');
    };

    const openBook = (bookId) => {
        const book = booksById[bookId];
        const savedState = readingState[bookId];
        const safePageIndex = book
            ? clamp(savedState?.pageIndex || 0, 0, book.pages.length - 1)
            : 0;
        const now = new Date().toISOString();

        setSelectedBookId(bookId);
        const addedToShelf = ensureBookOnShelf(bookId);
        if (book) {
            setReadingState((prev) => {
                const current = prev[bookId];
                return {
                    ...prev,
                    [bookId]: {
                        pageIndex: safePageIndex,
                        minutes: current?.minutes || 0,
                        startedAt: current?.startedAt || now,
                        lastReadAt: now,
                        completedAt: current?.completedAt || null,
                    },
                };
            });
        }
        clearViewQuery('reader');
        setActiveView('reader');
        recordActivity('open', bookId, { pageTitle: book?.pages?.[safePageIndex]?.title || '' });

        if (book && addedToShelf) {
            pushToast(`已加入书架，并打开《${book.title}》`, 'success');
        }
    };

    const toggleShelf = (bookId) => {
        const exists = shelfIds.includes(bookId);
        const book = booksById[bookId];
        setShelfIds((prev) => (
            exists ? prev.filter((id) => id !== bookId) : [bookId, ...prev]
        ));
        recordActivity(exists ? 'shelf-remove' : 'shelf-add', bookId);
        if (book) {
            pushToast(exists ? `已从书架移出《${book.title}》` : `已加入书架：《${book.title}》`, exists ? 'info' : 'success');
        }
    };

    const updatePageProgress = (book, nextIndex) => {
        if (!book) {
            return;
        }

        const safeIndex = clamp(nextIndex, 0, book.pages.length - 1);
        const wasCompleted = Boolean(readingState[book.id]?.completedAt);
        setReadingState((prev) => {
            const current = prev[book.id] || {};
            const now = new Date().toISOString();
            return {
                ...prev,
                [book.id]: {
                    pageIndex: safeIndex,
                    minutes: Math.max(current.minutes || 0, (safeIndex + 1) * READING_MINUTES_PER_PAGE),
                    startedAt: current.startedAt || now,
                    lastReadAt: now,
                    completedAt: safeIndex === book.pages.length - 1
                        ? (current.completedAt || now)
                        : (current.completedAt || null),
                },
            };
        });
        recordActivity('page-turn', book.id, { pageTitle: book.pages[safeIndex]?.title || '' });

        if (safeIndex === book.pages.length - 1 && !wasCompleted) {
            pushToast(`已读完《${book.title}》`, 'success');
        }
    };

    const createNote = ({ book, page, quote, contentHtml, title }) => {
        const nextNote = {
            id: uid('note'),
            title: title || `${book.title} · ${page.title}`,
            bookId: book.id,
            bookTitle: book.title,
            pageTitle: page.title,
            quote: quote || '',
            contentHtml: contentHtml || `<p>阅读感受：</p>${quote ? `<blockquote>${quote}</blockquote>` : ''}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        setNotes((prev) => [nextNote, ...prev]);
        setActiveNoteId(nextNote.id);
        setSelectedBookId(book.id);
        clearViewQuery('notes');
        setActiveView('notes');
        recordActivity('note-create', book.id, { pageTitle: page.title });
        pushToast(`已从《${book.title}》创建新笔记`, 'success');
    };

    const handleSaveNote = () => {
        if (!activeNote) {
            return;
        }

        const now = new Date().toISOString();
        setNotes((prev) => prev.map((note) => (
            note.id === activeNote.id
                ? {
                    ...note,
                    title: draftNoteTitle || note.title,
                    pageTitle: draftNotePageTitle || note.pageTitle,
                    quote: draftNoteQuote,
                    contentHtml: draftNoteContent || '<p></p>',
                    updatedAt: now,
                }
                : note
        )));
        recordActivity('note-save', activeNote.bookId, { pageTitle: draftNotePageTitle || activeNote.pageTitle });
        pushToast('笔记已保存', 'success');
    };

    const handleNoteFormat = (command, value = null) => {
        if (!noteEditorRef.current) {
            return;
        }

        noteEditorRef.current.focus();
        document.execCommand(command, false, value);
        setDraftNoteContent(noteEditorRef.current.innerHTML || '');
    };

    const selectedBookHandoff = selectedBook
        ? handoffHref(selectedBook.fireflyPrompt)
        : handoffHref('请基于我当前在 AI 图书馆 的阅读内容，继续帮我推进阅读任务。');
    const contextNote = activeView === 'notes' && activeQuery.trim() && filteredNotes.length === 0
        ? null
        : activeNote;
    const activeNoteHandoff = contextNote
        ? handoffHref(`请基于这条阅读笔记继续推进，并转成结构化任务：\n书名：${contextNote.bookTitle}\n页标题：${contextNote.pageTitle}\n摘录：${contextNote.quote}\n笔记内容：${stripHtml(contextNote.contentHtml)}`)
        : selectedBookHandoff;
    const currentBookOnShelf = selectedBook ? shelfIds.includes(selectedBook.id) : false;
    const assistantModelLabel = resolveChatModel(defaultChatModelId).label;
    const fireflyLauncherLabel = activeView === 'reader'
        ? 'AI 阅读'
        : activeView === 'notes'
            ? 'AI 整理'
            : '萤火虫';
    const assistantPlaceholder = activeView === 'notes'
        ? '围绕当前笔记提问，例如：把这条笔记整理成一段汇报摘要'
        : activeView === 'reader'
            ? '围绕当前页提问，例如：这页真正想说明什么？'
            : '围绕当前图书提问，例如：这本书适合怎样继续读？';
    const drawerShortcuts = activeView === 'notes'
        ? [
            { id: 'note-structure', label: '整理笔记', prompt: '请把当前笔记整理成更清晰的结构，并保留原有观点。' },
            { id: 'note-summary', label: '生成摘要', prompt: '请把当前笔记压缩成一段适合汇报的摘要。' },
            { id: 'note-next', label: '生成后续任务', prompt: '请基于当前笔记，给我 3 个后续可以继续推进的任务。' },
        ]
        : libraryAssistantShortcuts;
    const drawerContextChips = [
        selectedBook ? `《${selectedBook.title}》` : null,
        currentPage?.title || null,
        activeView === 'notes' && activeNote ? activeNote.title : null,
    ].filter(Boolean);
    const searchPlaceholderMap = {
        plaza: '搜索图书、作者、主题词',
        shelf: '搜索书架里的书和阅读记录',
        reader: '搜索其他图书并快速切换',
        notes: '搜索笔记、摘录和书名',
        stats: '搜索想查看统计的图书',
        connectors: '搜索馆藏系统、借阅记录和电子资源',
    };

    return (
        <div className={`library-page ${activeView === 'reader' ? 'reader-focus' : ''} ${isRailCollapsed ? 'rail-collapsed' : ''} ${isFireflyDrawerOpen ? 'firefly-open' : ''}`}>
            <aside className={`library-rail glass-strong ${isRailCollapsed ? 'collapsed' : ''}`}>
                <div className="library-rail-top">
                    <div className="library-brand">
                        <span className="library-kicker">AI 图书馆</span>
                        {!isRailCollapsed && (
                            <>
                                <h1>阅读工作台</h1>
                                <p>不是只帮你找到书，而是把选书、书架、阅读、笔记、馆藏联动和萤火虫协同放在同一个工作面里。</p>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        className="library-rail-toggle"
                        onClick={() => setIsRailCollapsed((prev) => !prev)}
                        aria-label={isRailCollapsed ? '展开图书馆侧栏' : '折叠图书馆侧栏'}
                        title={isRailCollapsed ? '展开图书馆侧栏' : '折叠图书馆侧栏'}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d={isRailCollapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
                        </svg>
                    </button>
                </div>

                <div className="library-nav-list">
                    {libraryViews.map((view) => (
                        <button
                            key={view.id}
                            type="button"
                            title={view.label}
                            className={`library-nav-item ${activeView === view.id ? 'active' : ''}`}
                            onClick={() => setActiveView(view.id)}
                        >
                            <span className="library-nav-icon">{libraryViewIcons[view.id]}</span>
                            {!isRailCollapsed && (
                                <span className="library-nav-copy">
                                    <strong>{view.label}</strong>
                                    <span>{view.desc}</span>
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {!isRailCollapsed ? (
                    <>
                        <div className="library-rail-card">
                            <span className="library-side-label">阅读概览</span>
                            <div className="library-mini-metrics">
                                <div>
                                    <strong>{shelfBooks.length}</strong>
                                    <span>书架图书</span>
                                </div>
                                <div>
                                    <strong>{notes.length}</strong>
                                    <span>阅读笔记</span>
                                </div>
                                <div>
                                    <strong>{readingStreak}</strong>
                                    <span>连续阅读天数</span>
                                </div>
                            </div>
                        </div>

                        <div className="library-rail-card">
                            <span className="library-side-label">在借提醒</span>
                            <div className="library-rail-list">
                                {libraryBorrowRecords.slice(0, 3).map((item) => (
                                    <div key={item.id} className="library-rail-row">
                                        <strong>{item.title}</strong>
                                        <span>{item.status} · {item.dueDate}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {selectedBook && (
                            <div className="library-rail-card">
                                <span className="library-side-label">当前阅读</span>
                                <div className="library-current-book">
                                    <div className={`library-cover-chip tone-${selectedBook.coverTone}`}>{selectedBook.genre}</div>
                                    <div>
                                        <strong>{selectedBook.title}</strong>
                                        <span>{selectedBook.author}</span>
                                    </div>
                                </div>
                                <div className="library-rail-actions">
                                    <button type="button" className="library-rail-action" onClick={() => openBook(selectedBook.id)}>
                                        继续阅读
                                    </button>
                                    {selectedBook.resourceUrl && (
                                        <button
                                            type="button"
                                            className="library-rail-action secondary"
                                            onClick={() => openBookResource(selectedBook)}
                                        >
                                            {selectedBook.accessLabel || '免费原书'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="library-rail-card library-rail-card-accent">
                            <span className="library-side-label">萤火虫联动</span>
                            <p>任何页面都可以直接拉出图书馆对话抽屉，记录会同步到萤火虫历史。</p>
                            <div className="library-rail-actions">
                                <button
                                    type="button"
                                    className="library-rail-action"
                                    onClick={() => setIsFireflyDrawerOpen((prev) => !prev)}
                                >
                                    {isFireflyDrawerOpen ? '收起抽屉' : `${fireflyLauncherLabel} 抽屉`}
                                </button>
                                <Link href={activeView === 'notes' ? activeNoteHandoff : selectedBookHandoff} className="library-rail-action secondary">
                                    完整工作台
                                </Link>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="library-rail-collapsed-tools">
                        <button
                            type="button"
                            className="library-rail-mini-btn"
                            title={isFireflyDrawerOpen ? '收起萤火虫抽屉' : `打开${fireflyLauncherLabel}抽屉`}
                            onClick={() => setIsFireflyDrawerOpen((prev) => !prev)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 7h16v10H7l-3 3V7z" />
                            </svg>
                        </button>
                        {selectedBook && (
                            <button
                                type="button"
                                className="library-rail-mini-btn"
                                title={`继续阅读《${selectedBook.title}》`}
                                onClick={() => openBook(selectedBook.id)}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
            </aside>

            <main className="library-stage">
                <div className="library-topbar glass">
                    <div className="library-search-shell">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            value={activeQuery}
                            onChange={(event) => setViewQuery(activeView, event.target.value)}
                            placeholder={searchPlaceholderMap[activeView]}
                        />
                        {activeQuery && (
                            <button
                                type="button"
                                className="library-search-clear"
                                onClick={() => clearViewQuery(activeView)}
                                aria-label="清空搜索"
                            >
                                ×
                            </button>
                        )}
                    </div>

                    <div className="library-topbar-meta">
                        <div className="library-topbar-pill">
                            <span>书架</span>
                            <strong>{shelfBooks.length} 本</strong>
                        </div>
                        <div className="library-topbar-pill">
                            <span>已读时长</span>
                            <strong>{totalMinutes} 分钟</strong>
                        </div>
                        <button
                            type="button"
                            className={`library-firefly-link ${isFireflyDrawerOpen ? 'active' : ''}`}
                            onClick={() => setIsFireflyDrawerOpen((prev) => !prev)}
                        >
                            {isFireflyDrawerOpen ? '收起萤火虫' : fireflyLauncherLabel}
                        </button>
                        <Link href={activeView === 'notes' ? activeNoteHandoff : selectedBookHandoff} className="library-firefly-link ghost">
                            完整工作台
                        </Link>
                    </div>
                </div>

                {activeView === 'plaza' && (
                    <div className="library-stage-scroll">
                        <section className="library-hero glass-strong">
                            <div className="library-hero-copy">
                                <span className="library-section-kicker">图书广场</span>
                                <h2>像在图书馆里逛，也像在微信读书里继续读下去</h2>
                                <p>先发现，再加入书架，再进入阅读器和笔记流。AI 图书馆 不该停在“搜到了什么”，而应该推动“你接下来准备怎么读”。</p>
                                <div className="library-genre-row">
                                    {libraryGenres.map((genre) => (
                                        <button
                                            key={genre}
                                            type="button"
                                            className={`library-genre-chip ${selectedGenre === genre ? 'active' : ''}`}
                                            onClick={() => setSelectedGenre(genre)}
                                        >
                                            {genre}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {featuredBook && (
                                <button
                                    type="button"
                                    className="library-feature-book"
                                    onClick={() => openBook(featuredBook.id)}
                                >
                                    <div className={`library-feature-cover tone-${featuredBook.coverTone}`}>
                                        <span>{featuredBook.genre}</span>
                                        <strong>{featuredBook.title.slice(0, 6)}</strong>
                                    </div>
                                        <div className="library-feature-body">
                                            <div className="library-feature-meta">
                                                <span>{featuredBook.genre}</span>
                                                <span>{featuredBook.availability}</span>
                                                {featuredBook.resourceUrl && (
                                                    <span>{featuredBook.resourceLabel}</span>
                                                )}
                                            </div>
                                            <h3>{featuredBook.title}</h3>
                                            <p>{featuredBook.recommendation}</p>
                                        <div className="library-feature-actions">
                                            <span>{featuredBook.author}</span>
                                            <span>{featuredBook.readTime}</span>
                                        </div>
                                    </div>
                                </button>
                            )}
                        </section>

                        <section className="library-surface glass-strong">
                            <div className="library-panel-head">
                                <div>
                                    <span className="library-section-kicker">编辑推荐</span>
                                    <h2>分主题选书</h2>
                                </div>
                                <span className="library-panel-meta">{filteredBooks.length} 本可浏览</span>
                            </div>

                            {filteredFeaturedCollections.length > 0 && (
                                <div className="library-collection-stack">
                                    {filteredFeaturedCollections.map((collection) => (
                                        <div key={collection.id} className="library-collection-block">
                                            <div className="library-collection-head">
                                                <div>
                                                    <strong>{collection.label}</strong>
                                                    <p>{collection.desc}</p>
                                                </div>
                                            </div>
                                            <div className="library-book-strip">
                                                {collection.books.map((book) => (
                                                    <button
                                                        key={book.id}
                                                        type="button"
                                                        className="library-spine"
                                                        onClick={() => {
                                                            setSelectedBookId(book.id);
                                                            openBook(book.id);
                                                        }}
                                                    >
                                                        <div className={`library-spine-cover tone-${book.coverTone}`}>
                                                            <span>{book.genre}</span>
                                                        </div>
                                                        <div className="library-spine-copy">
                                                            <strong>{book.title}</strong>
                                                            <span>{book.author}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {filteredBooks.length > 0 ? (
                                <div className="library-book-grid">
                                    {filteredBooks.map((book) => (
                                        <article key={book.id} className="library-book-card">
                                            <button
                                                type="button"
                                                className="library-book-open"
                                                onClick={() => {
                                                    setSelectedBookId(book.id);
                                                    openBook(book.id);
                                                }}
                                            >
                                                <div className={`library-book-cover tone-${book.coverTone}`}>
                                                    <span>{book.genre}</span>
                                                    <strong>{book.title.slice(0, 6)}</strong>
                                                </div>
                                                <div className="library-book-copy">
                                                    <div className="library-book-meta">
                                                        <span>{book.source}</span>
                                                        <span>{book.availability}</span>
                                                    </div>
                                                    <h3>{book.title}</h3>
                                                    <p>{book.summary}</p>
                                                    <div className="library-book-tags">
                                                        {book.tags.map((tag) => (
                                                            <span key={tag}>{tag}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </button>
                                            <div className="library-book-actions">
                                                <button type="button" className="library-ghost-btn" onClick={() => toggleShelf(book.id)}>
                                                    {shelfIds.includes(book.id) ? '移出书架' : '加入书架'}
                                                </button>
                                                <button type="button" className="library-primary-btn" onClick={() => openBook(book.id)}>
                                                    进入阅读
                                                </button>
                                                {book.resourceUrl && (
                                                    <button
                                                        type="button"
                                                        className="library-ghost-btn library-resource-btn"
                                                        onClick={() => openBookResource(book)}
                                                    >
                                                        {book.accessLabel || '免费原书'}
                                                    </button>
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div className="library-empty-state">
                                    <h3>没有找到匹配的图书</h3>
                                    <p>可以试试换个关键词，或者把分类切回“全部”继续浏览。</p>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {activeView === 'shelf' && (
                    <div className="library-stage-scroll">
                        <section className="library-surface glass-strong">
                            <div className="library-panel-head">
                                <div>
                                    <span className="library-section-kicker">我的书架</span>
                                    <h2>把广场里的书带回自己的长期阅读空间</h2>
                                </div>
                                <span className="library-panel-meta">已加入 {shelfBooks.length} 本</span>
                            </div>

                            {filteredShelfBooks.length > 0 ? (
                                <div className="library-shelf-list">
                                    {filteredShelfBooks.map((book) => {
                                        const bookProgress = readingState[book.id] || { pageIndex: 0, minutes: 0, lastReadAt: null };
                                        const progress = Math.round(((Math.min(book.pages.length - 1, bookProgress.pageIndex || 0) + 1) / book.pages.length) * 100);
                                        const currentPageTitle = book.pages[Math.min(book.pages.length - 1, bookProgress.pageIndex || 0)]?.title || '尚未开始';

                                        return (
                                            <article key={book.id} className="library-shelf-card">
                                                <div className="library-shelf-head">
                                                    <div className={`library-shelf-cover tone-${book.coverTone}`}>
                                                        <span>{book.genre}</span>
                                                    </div>
                                                    <div className="library-shelf-copy">
                                                        <div className="library-shelf-title-row">
                                                            <div>
                                                                <strong>{book.title}</strong>
                                                                <span>{book.author}</span>
                                                            </div>
                                                            <span className="library-shelf-status">{progress}%</span>
                                                        </div>
                                                        <p>{book.summary}</p>
                                                        <div className="library-shelf-info-grid">
                                                            <span>出版社 / 来源：{book.publisher || book.source}</span>
                                                            <span>阅读记录：{currentPageTitle}</span>
                                                            <span>上次阅读：{bookProgress.lastReadAt ? formatDateTime(bookProgress.lastReadAt) : '还没开始'}</span>
                                                            <span>累计阅读时间：{bookProgress.minutes || 0} 分钟</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="library-shelf-actions">
                                                    <div className="library-progress-row compact">
                                                        <span>进度</span>
                                                        <div className="library-progress-track">
                                                            <span style={{ width: `${progress}%` }} />
                                                        </div>
                                                        <strong>{progress}%</strong>
                                                    </div>
                                                    <div className="library-book-actions shelf">
                                                        <button type="button" className="library-ghost-btn" onClick={() => toggleShelf(book.id)}>
                                                            移出书架
                                                        </button>
                                                        <button type="button" className="library-primary-btn" onClick={() => openBook(book.id)}>
                                                            继续阅读
                                                        </button>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="library-empty-state">
                                    <h3>{shelfBooks.length > 0 ? '书架里没有匹配结果' : '书架还是空的'}</h3>
                                    <p>{shelfBooks.length > 0 ? '换个关键词试试，或者回到图书广场继续加书。' : '先从图书广场挑一本到书架里，阅读工作流才会真正成立起来。'}</p>
                                </div>
                            )}
                        </section>

                        <section className="library-surface glass-strong">
                            <div className="library-panel-head">
                                <div>
                                    <span className="library-section-kicker">阅读轨迹</span>
                                    <h2>最近推进了什么</h2>
                                </div>
                            </div>

                            {filteredLatestActivity.length > 0 ? (
                                <div className="library-activity-list">
                                    {filteredLatestActivity.map((item) => (
                                        <div key={item.id} className="library-activity-item">
                                            <strong>{item.bookTitle}</strong>
                                            <span>{item.summary}</span>
                                            <small>{formatDateTime(item.at)}</small>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="library-empty-state">
                                    <h3>没有找到对应的阅读轨迹</h3>
                                    <p>当前关键词没有命中最近活动，可以清空搜索后继续查看完整轨迹。</p>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                {activeView === 'reader' && selectedBook && currentPage && (
                    <div className="library-stage-scroll">
                        <div className={`library-reader-shell ${isReaderIndexCollapsed ? 'compact' : ''}`}>
                            <aside className={`library-reader-index glass-strong ${isReaderIndexCollapsed ? 'collapsed' : ''}`}>
                                <div className="library-reader-index-head">
                                    <div>
                                        <span className="library-side-label">目录</span>
                                        <strong>{selectedBook.title}</strong>
                                    </div>
                                    <button
                                        type="button"
                                        className="library-reader-index-toggle"
                                        onClick={() => setIsReaderIndexCollapsed(true)}
                                    >
                                        收起
                                    </button>
                                </div>
                                <div className="library-reader-index-meta">
                                    <span>{selectedBook.author}</span>
                                    <span>{selectedBook.year} · {selectedBook.genre}</span>
                                </div>
                                {activeQuery ? (
                                    <div className="library-reader-switcher">
                                        <span className="library-side-label">快速切换</span>
                                        {filteredReaderBooks.length > 0 ? (
                                            <div className="library-reader-switch-list">
                                                {filteredReaderBooks.map((book) => (
                                                    <button key={book.id} type="button" className="library-reader-switch-item" onClick={() => openBook(book.id)}>
                                                        <strong>{book.title}</strong>
                                                        <span>{book.author}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="library-reader-switch-empty">没有找到匹配的图书，可以换个关键词继续切换。</p>
                                        )}
                                    </div>
                                ) : null}
                                <div className="library-page-list">
                                    {selectedBook.pages.map((page, index) => (
                                        <button
                                            key={page.id}
                                            type="button"
                                            className={`library-page-chip ${index === currentPageIndex ? 'active' : ''}`}
                                            onClick={() => updatePageProgress(selectedBook, index)}
                                        >
                                            <span>第 {index + 1} 节</span>
                                            <strong>{page.title}</strong>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <section className="library-reader-stage glass-strong">
                                <div className="library-reader-utility">
                                    <div className="library-reader-breadcrumb">
                                        <span>AI 图书馆</span>
                                        <span>/</span>
                                        <span>阅读器</span>
                                        <span>/</span>
                                        <strong>{selectedBook.title}</strong>
                                    </div>
                                    <div className="library-reader-utility-actions">
                                        <button
                                            type="button"
                                            className="library-ghost-btn"
                                            onClick={() => setIsReaderIndexCollapsed((prev) => !prev)}
                                        >
                                            {isReaderIndexCollapsed ? '展开目录' : '收起目录'}
                                        </button>
                                        <button
                                            type="button"
                                            className="library-ghost-btn"
                                            onClick={() => setIsFireflyDrawerOpen((prev) => !prev)}
                                        >
                                            {isFireflyDrawerOpen ? '收起 AI 阅读' : 'AI 阅读'}
                                        </button>
                                        {selectedBook.resourceUrl && (
                                            <button
                                                type="button"
                                                className="library-ghost-btn"
                                                onClick={() => openBookResource(selectedBook, '免费全文')}
                                            >
                                                {selectedBook.accessLabel || '免费原书'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="library-reader-head">
                                    <div className="library-reader-title-block">
                                        <span className="library-section-kicker">阅读中</span>
                                        <h2>{currentPage.title}</h2>
                                        <p>{selectedBook.title} · {selectedBook.author}</p>
                                    </div>
                                    <div className="library-reader-actions">
                                        <span className="library-reader-meta-pill">第 {currentPageIndex + 1} / {selectedBook.pages.length} 节</span>
                                        <span className="library-reader-meta-pill">{selectedBookProgress}%</span>
                                        <span className="library-reader-meta-pill">累计 {selectedReadingState.minutes || 0} 分钟</span>
                                        <button type="button" className="library-ghost-btn" onClick={() => toggleShelf(selectedBook.id)}>
                                            {currentBookOnShelf ? '移出书架' : '加入书架'}
                                        </button>
                                        <button
                                            type="button"
                                            className="library-primary-btn"
                                            onClick={() => createNote({
                                                book: selectedBook,
                                                page: currentPage,
                                                quote: currentPage.quote,
                                                title: `${selectedBook.title} · ${currentPage.title}`,
                                            })}
                                        >
                                            摘录成笔记
                                        </button>
                                    </div>
                                </div>

                                <article className="library-reader-paper">
                                    <div className="library-reader-paper-meta">
                                        <span>{selectedBook.author}</span>
                                        <span>{selectedBook.readTime}</span>
                                        <span>{selectedBook.availability}</span>
                                    </div>
                                    <blockquote>{currentPage.quote}</blockquote>
                                    {currentPage.body.map((paragraph) => (
                                        <p key={paragraph}>{paragraph}</p>
                                    ))}
                                </article>

                                <div className="library-reader-footer">
                                    <button
                                        type="button"
                                        className="library-ghost-btn"
                                        onClick={() => updatePageProgress(selectedBook, currentPageIndex - 1)}
                                        disabled={currentPageIndex === 0}
                                    >
                                        上一节
                                    </button>
                                    <div className="library-reader-footer-meta">
                                        <strong>{selectedBook.title}</strong>
                                        <span>{selectedBook.subtitle}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="library-primary-btn"
                                        onClick={() => updatePageProgress(selectedBook, currentPageIndex + 1)}
                                        disabled={currentPageIndex === selectedBook.pages.length - 1}
                                    >
                                        下一节
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {activeView === 'notes' && (
                    <div className="library-stage-scroll">
                        <div className="library-notes-shell">
                            <section className="library-note-list-panel glass-strong">
                                <div className="library-panel-head compact">
                                    <div>
                                        <span className="library-section-kicker">我的笔记</span>
                                        <h2>摘录和阅读感想</h2>
                                    </div>
                                    <button
                                        type="button"
                                        className="library-primary-btn"
                                        onClick={() => createNote({
                                            book: selectedBook,
                                            page: currentPage || selectedBook.pages[0],
                                            quote: currentPage?.quote || '',
                                            title: `${selectedBook.title} · 新笔记`,
                                            contentHtml: '<p>新的阅读笔记：</p>',
                                        })}
                                    >
                                        新建笔记
                                    </button>
                                </div>

                                {filteredNotes.length > 0 ? (
                                    <div className="library-note-list">
                                        {filteredNotes.map((note) => (
                                            <button
                                                key={note.id}
                                                type="button"
                                                className={`library-note-list-item ${activeNoteId === note.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    setActiveNoteId(note.id);
                                                    setSelectedBookId(note.bookId);
                                                }}
                                            >
                                                <div className="library-note-row-head">
                                                    <strong>{note.title}</strong>
                                                    <small>{formatDateTime(note.updatedAt)}</small>
                                                </div>
                                                <div className="library-note-row-meta">
                                                    <span>{note.bookTitle}</span>
                                                    <span>{note.pageTitle}</span>
                                                </div>
                                                {note.quote && (
                                                    <blockquote>{note.quote}</blockquote>
                                                )}
                                                <p>{stripHtml(note.contentHtml).slice(0, 110)}</p>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="library-empty-state compact">
                                        <h3>没有找到匹配笔记</h3>
                                        <p>可以清空搜索，或者从阅读器里继续摘录新的阅读感想。</p>
                                    </div>
                                )}
                            </section>

                            <section className="library-note-editor-panel glass-strong">
                                {filteredNotes.length > 0 && activeNote ? (
                                    <>
                                        <div className="library-panel-head compact">
                                            <div>
                                                <span className="library-section-kicker">笔记编辑器</span>
                                                <h2>{activeNote.bookTitle}</h2>
                                            </div>
                                            <div className="library-note-editor-actions">
                                                <button
                                                    type="button"
                                                    className="library-ghost-btn"
                                                    onClick={() => setIsFireflyDrawerOpen(true)}
                                                >
                                                    AI 整理
                                                </button>
                                                <button type="button" className="library-primary-btn" onClick={handleSaveNote}>
                                                    保存笔记
                                                </button>
                                            </div>
                                        </div>

                                        <div className="library-note-meta">
                                            <span>{activeNote.bookTitle}</span>
                                            <span>{draftNotePageTitle || activeNote.pageTitle}</span>
                                            <span>{formatDateTime(activeNote.updatedAt)}</span>
                                        </div>

                                        <div className="library-note-form-grid">
                                            <input
                                                type="text"
                                                className="library-note-title-input"
                                                value={draftNoteTitle}
                                                onChange={(event) => setDraftNoteTitle(event.target.value)}
                                                placeholder="给这条笔记一个标题"
                                            />

                                            <input
                                                type="text"
                                                className="library-note-quote-input"
                                                value={draftNoteQuote}
                                                onChange={(event) => setDraftNoteQuote(event.target.value)}
                                                placeholder="摘录原文或关键句"
                                            />
                                        </div>

                                        <div className="library-editor-toolbar">
                                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => handleNoteFormat('bold')}>加粗</button>
                                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => handleNoteFormat('italic')}>斜体</button>
                                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => handleNoteFormat('insertUnorderedList')}>列表</button>
                                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => handleNoteFormat('formatBlock', 'blockquote')}>引用</button>
                                            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => handleNoteFormat('formatBlock', 'h3')}>标题</button>
                                        </div>

                                        <div
                                            ref={noteEditorRef}
                                            className="library-editor-surface"
                                            contentEditable
                                            suppressContentEditableWarning
                                            onInput={(event) => setDraftNoteContent(event.currentTarget.innerHTML)}
                                        />
                                    </>
                                ) : (
                                    <div className="library-empty-state">
                                        <h3>还没有笔记</h3>
                                        <p>从阅读器里摘录当前页，或者直接新建一条阅读感想。</p>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                )}

                {activeView === 'stats' && (
                    <div className="library-stage-scroll">
                        <section className="library-stats-hero glass-strong">
                            <div className="library-panel-head">
                                <div>
                                    <span className="library-section-kicker">阅读统计</span>
                                    <h2>把阅读沉淀成能被长期看见的指标</h2>
                                </div>
                                <span className="library-panel-meta">围绕书架、笔记和阅读推进自动累计</span>
                            </div>

                            <div className="library-metric-grid">
                                <div className="library-metric-card">
                                    <span>年度阅读本数</span>
                                    <strong>{yearlyBooks}</strong>
                                </div>
                                <div className="library-metric-card">
                                    <span>累计阅读本数</span>
                                    <strong>{Object.keys(readingState).length}</strong>
                                </div>
                                <div className="library-metric-card">
                                    <span>累计阅读时长</span>
                                    <strong>{totalMinutes} 分钟</strong>
                                </div>
                                <div className="library-metric-card">
                                    <span>连续阅读天数</span>
                                    <strong>{readingStreak} 天</strong>
                                </div>
                                <div className="library-metric-card">
                                    <span>已完成阅读</span>
                                    <strong>{totalCompletedBooks} 本</strong>
                                </div>
                                <div className="library-metric-card">
                                    <span>笔记总数</span>
                                    <strong>{notes.length} 条</strong>
                                </div>
                            </div>
                        </section>

                        <div className="library-stats-columns">
                            <section className="library-surface glass-strong library-stats-full">
                                <div className="library-panel-head compact">
                                    <div>
                                        <span className="library-section-kicker">最近半年</span>
                                        <h2>阅读活跃度</h2>
                                    </div>
                                </div>
                                <div className="library-bar-chart">
                                    {monthlyActivity.map((item) => (
                                        <div key={item.key} className="library-bar-item">
                                            <div className="library-bar-track">
                                                <span style={{ height: `${Math.max(item.ratio * 100, item.count > 0 ? 18 : 4)}%` }} />
                                            </div>
                                            <strong>{item.count}</strong>
                                            <small>{item.label}</small>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="library-surface glass-strong">
                                <div className="library-panel-head compact">
                                    <div>
                                        <span className="library-section-kicker">书架结构</span>
                                        <h2>阅读类型分布</h2>
                                    </div>
                                </div>
                                <div className="library-distribution-list">
                                    {genreDistribution.map((item) => (
                                        <div key={item.genre} className="library-distribution-row">
                                            <strong>{item.genre}</strong>
                                            <div className="library-progress-track">
                                                <span style={{ width: `${(item.count / Math.max(shelfBooks.length, 1)) * 100}%` }} />
                                            </div>
                                            <span>{item.count} 本</span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="library-surface glass-strong">
                                <div className="library-panel-head compact">
                                    <div>
                                        <span className="library-section-kicker">图书明细</span>
                                        <h2>当前统计涉及图书</h2>
                                    </div>
                                    <span className="library-panel-meta">{filteredTrackedBooks.length} 本</span>
                                </div>
                                {filteredTrackedBooks.length > 0 ? (
                                    <div className="library-stat-book-list">
                                        {filteredTrackedBooks.map((item) => (
                                            <div key={item.book.id} className="library-stat-book-row">
                                                <div className="library-stat-book-copy">
                                                    <strong>{item.book.title}</strong>
                                                    <span>{item.book.author} · 上次阅读 {item.lastReadAt ? formatDateTime(item.lastReadAt) : '暂无记录'}</span>
                                                </div>
                                                <div className="library-progress-row compact">
                                                    <div className="library-progress-track">
                                                        <span style={{ width: `${item.progress}%` }} />
                                                    </div>
                                                    <strong>{item.progress}%</strong>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="library-empty-state">
                                        <h3>没有匹配的统计图书</h3>
                                        <p>可以按书名或作者搜索，快速定位某本书对应的阅读进度。</p>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                )}

                {activeView === 'connectors' && (
                    <div className="library-stage-scroll">
                        <section className="library-surface glass-strong">
                            <div className="library-panel-head">
                                <div>
                                    <span className="library-section-kicker">馆藏联动</span>
                                    <h2>面向高校的 AI 图书馆，最终要接入真实馆藏系统</h2>
                                </div>
                                <span className="library-panel-meta">先只读，再逐步进入电子书、期刊与借阅工作流</span>
                            </div>

                            {filteredConnectors.length > 0 ? (
                                <div className="library-connector-grid">
                                    {filteredConnectors.map((connector) => (
                                        <article key={connector.id} className="library-connector-card">
                                            <div className="library-connector-head">
                                                <strong>{connector.name}</strong>
                                                <span>{connector.status}</span>
                                            </div>
                                            <p>{connector.detail}</p>
                                            <small>{connector.scope}</small>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div className="library-empty-state">
                                    <h3>没有匹配的系统接入项</h3>
                                    <p>当前关键词没有命中馆藏系统或资源接入项，可以清空后继续查看全量规划。</p>
                                </div>
                            )}
                        </section>

                        <div className="library-connectors-shell">
                            <section className="library-surface glass-strong">
                                <div className="library-panel-head compact">
                                    <div>
                                        <span className="library-section-kicker">我的借阅</span>
                                        <h2>当前借阅与归还状态</h2>
                                    </div>
                                </div>
                                {filteredBorrowRecords.length > 0 ? (
                                    <div className="library-borrow-list">
                                        {filteredBorrowRecords.map((item) => (
                                            <div key={item.id} className="library-borrow-item">
                                                <strong>{item.title}</strong>
                                                <span>{item.status}</span>
                                                <small>{item.source} · {item.dueDate}</small>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="library-empty-state compact">
                                        <h3>没有匹配的借阅记录</h3>
                                        <p>可以按书名、状态或来源继续筛选。</p>
                                    </div>
                                )}
                            </section>

                            <section className="library-surface glass-strong">
                                <div className="library-panel-head compact">
                                    <div>
                                        <span className="library-section-kicker">馆藏检索</span>
                                        <h2>电子书、期刊与校内资源</h2>
                                    </div>
                                    <span className="library-panel-meta">{catalogMatches.length} 条结果</span>
                                </div>
                                {catalogMatches.length > 0 ? (
                                    <div className="library-catalog-list">
                                        {catalogMatches.map((item) => (
                                            <article key={item.id} className="library-catalog-item">
                                                <div className="library-catalog-head">
                                                    <strong>{item.title}</strong>
                                                    <span>{item.status}</span>
                                                </div>
                                                <p>{item.source} · {item.location}</p>
                                                <div className="library-book-tags">
                                                    {item.tags.map((tag) => (
                                                        <span key={tag}>{tag}</span>
                                                    ))}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="library-empty-state compact">
                                        <h3>没有匹配的馆藏结果</h3>
                                        <p>可以换个关键词继续搜图书、期刊或校内资源。</p>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                )}
            </main>

            <aside className="library-context glass-strong">
                <div className="library-context-scroll">
                    {selectedBook && (
                        <div className="library-context-card current">
                            <div className="library-context-head">
                                <span className="library-section-kicker">当前资料</span>
                                <button type="button" className="library-inline-link" onClick={() => setIsFireflyDrawerOpen(true)}>在侧边继续问</button>
                            </div>
                            <h3>{selectedBook.title}</h3>
                            <p>{selectedBook.summary}</p>
                            <div className="library-book-tags">
                                {selectedBook.tags.map((tag) => (
                                    <span key={tag}>{tag}</span>
                                ))}
                            </div>
                            {selectedBook.resourceUrl && (
                                <button
                                    type="button"
                                    className="library-inline-link"
                                    onClick={() => openBookResource(selectedBook)}
                                >
                                    {selectedBook.accessLabel || '免费原书'}
                                </button>
                            )}
                        </div>
                    )}

                    {activeView === 'reader' && selectedBook && currentPage ? (
                        <div className="library-context-card assistant">
                            <div className="library-context-head">
                                <span className="library-section-kicker">阅读摘要</span>
                                <span className="library-assistant-model">{assistantModelLabel}</span>
                            </div>
                            <div className="library-context-quote">
                                <strong>{currentPage.title}</strong>
                                <p>{currentPage.quote}</p>
                            </div>
                            <div className="library-mini-metrics stacked">
                                <div>
                                    <strong>{selectedBookProgress}%</strong>
                                    <span>当前阅读进度</span>
                                </div>
                                <div>
                                    <strong>{selectedReadingState.minutes || 0} 分钟</strong>
                                    <span>累计阅读时长</span>
                                </div>
                            </div>
                            <div className="library-shortcut-row">
                                <button
                                    type="button"
                                    className="library-shortcut-chip"
                                    onClick={() => setIsFireflyDrawerOpen(true)}
                                >
                                    打开 AI 阅读
                                </button>
                                <button
                                    type="button"
                                    className="library-shortcut-chip"
                                    onClick={() => createNote({
                                        book: selectedBook,
                                        page: currentPage,
                                        quote: currentPage.quote,
                                        title: `${selectedBook.title} · ${currentPage.title}`,
                                    })}
                                >
                                    记成笔记
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {contextNote && (
                                <div className="library-context-card">
                                    <div className="library-context-head">
                                        <span className="library-section-kicker">当前笔记</span>
                                        <button type="button" className="library-inline-link" onClick={() => setIsFireflyDrawerOpen(true)}>在侧边继续问</button>
                                    </div>
                                    <h3>{contextNote.title}</h3>
                                    <p>{contextNote.quote || stripHtml(contextNote.contentHtml).slice(0, 88)}</p>
                                    <small>{contextNote.bookTitle} · {contextNote.pageTitle}</small>
                                </div>
                            )}

                            <div className="library-context-card">
                                <div className="library-context-head">
                                    <span className="library-section-kicker">阅读统计</span>
                                </div>
                                <div className="library-mini-metrics stacked">
                                    <div>
                                        <strong>{Object.keys(readingState).length}</strong>
                                        <span>累计阅读本数</span>
                                    </div>
                                    <div>
                                        <strong>{totalMinutes}</strong>
                                        <span>累计阅读分钟</span>
                                    </div>
                                    <div>
                                        <strong>{notes.length}</strong>
                                        <span>阅读笔记条数</span>
                                    </div>
                                </div>
                            </div>

                            <div className="library-context-card">
                                <div className="library-context-head">
                                    <span className="library-section-kicker">最近活动</span>
                                </div>
                                <div className="library-activity-list compact">
                                    {latestActivity.slice(0, 4).map((item) => (
                                        <div key={item.id} className="library-activity-item">
                                            <strong>{item.bookTitle}</strong>
                                            <span>{item.summary}</span>
                                            <small>{formatShortDate(item.at)}</small>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </aside>

            <FireflySideDrawer
                isOpen={isFireflyDrawerOpen}
                onOpenChange={setIsFireflyDrawerOpen}
                storageNamespace="library_firefly_drawer_v1"
                threadKey={selectedBook?.id || 'library'}
                historyOrigin="library"
                title="萤火虫"
                launcherLabel={fireflyLauncherLabel}
                launcherHint={activeView === 'reader' ? '陪读助手' : activeView === 'notes' ? '笔记整理' : '阅读协同'}
                description="围绕当前图书、当前页和当前笔记继续提问。这里更像阅读过程中的贴身协同抽屉，而不是另开一个孤立聊天页。"
                emptyTitle="从当前阅读上下文继续问"
                emptyDescription="我会优先理解你正在看的书、当前所在页和正在编辑的笔记，再给解释、摘要、阅读建议或后续任务。"
                placeholder={assistantPlaceholder}
                shortcuts={drawerShortcuts}
                contextChips={drawerContextChips}
                capabilityIds={['library']}
                contextSnapshot={assistantContextSnapshot}
                buildContextMessage={buildLibraryContextMessage}
                buildFallbackReply={buildFallbackLibraryReply}
                secondaryAction={{
                    href: activeView === 'notes' ? activeNoteHandoff : selectedBookHandoff,
                    label: '完整工作台',
                }}
                onAsk={({ contextSnapshot }) => {
                    if (!assistantContextSnapshot.bookId) {
                        return;
                    }

                    recordActivity('assistant-ask', assistantContextSnapshot.bookId, {
                        pageTitle: contextSnapshot?.pageTitle || assistantContextSnapshot.pageTitle,
                    });
                }}
                onFallback={() => pushToast('陪读回复已切换为本地兜底回答', 'info')}
                panelClassName="library-firefly-panel"
                buildSession={({ threadKey: currentThreadKey, thread, modelId, historyOrigin }) => {
                    const book = booksById[currentThreadKey];
                    if (!book || thread.length === 0) {
                        return null;
                    }

                    const updatedAt = thread[thread.length - 1]?.time || new Date().toISOString();

                    return {
                        id: `library-${book.id}`,
                        title: `AI 图书馆 · ${book.title}`,
                        date: new Date(updatedAt).toLocaleDateString('zh-CN'),
                        updatedAt,
                        messages: thread.map((item) => ({
                            role: item.role === 'user' ? 'user' : 'ai',
                            content: item.content,
                            time: item.time,
                            modelId: item.modelId || modelId,
                        })),
                        meta: {
                            capabilityIds: ['library'],
                            modelId,
                            webSearchEnabled: false,
                            deepResearchEnabled: false,
                            origin: historyOrigin,
                            bookId: book.id,
                            bookTitle: book.title,
                        },
                    };
                }}
            />

            {feedbackToast && (
                <div className="library-toast-stack" aria-live="polite">
                    <div className={`library-toast ${feedbackToast.tone || 'success'}`}>
                        {feedbackToast.message}
                    </div>
                </div>
            )}
        </div>
    );
}
