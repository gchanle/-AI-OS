import '../services/placeholder.css';

export const metadata = { title: 'AI图书馆 - AI校园' };

export default function LibraryPage() {
    return (
        <div className="placeholder-page">
            <div className="placeholder-content">
                <span className="placeholder-icon">📚</span>
                <h1>AI图书馆</h1>
                <p>智能阅读与图书推荐平台，即将上线</p>
                <div className="placeholder-features">
                    <div className="ph-feature"><span>🔍</span>智能搜索</div>
                    <div className="ph-feature"><span>📖</span>AI阅读</div>
                    <div className="ph-feature"><span>📝</span>智能笔记</div>
                </div>
            </div>
        </div>
    );
}
