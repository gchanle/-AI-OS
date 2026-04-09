import '../admin-sections.css';

const mockAgents = [
    { id: 'a-001', name: '校园办事助理', owner: '超星官方', status: '已发布', audience: '全校', ability: 'AI 办事' },
    { id: 'a-002', name: '科研线索顾问', owner: '学校科研处', status: '审核中', audience: '教师 / 研究生', ability: 'AI 科研' },
    { id: 'a-003', name: '图书馆阅读伴读', owner: '图书馆', status: '已发布', audience: '全校', ability: 'AI 图书馆' },
    { id: 'a-004', name: '课程跟进助手', owner: '教师发展中心', status: '草稿', audience: '教师', ability: 'AI 助教' },
];

export default function AdminAgentsPage() {
    return (
        <div className="admin-section-grid">
            <section className="admin-section-grid two">
                <article className="admin-section-card glass">
                    <h3>官方与学校智能体</h3>
                    <p>智能体管理不是给普通老师看的搭建器，而是学校运营侧管理哪些智能体能上架、谁能用、是否默认开放。</p>
                </article>
                <article className="admin-section-card glass">
                    <h3>后续适合补的能力</h3>
                    <div className="admin-chip-list" style={{ marginTop: 14 }}>
                        <span className="admin-chip active">上架审核</span>
                        <span className="admin-chip active">部门模板</span>
                        <span className="admin-chip active">版本发布</span>
                        <span className="admin-chip active">调用统计</span>
                    </div>
                </article>
            </section>

            <section className="admin-section-table glass">
                <h3>智能体目录</h3>
                <p>这部分后续可以和 Skill 市场、官方模板库、学校审核流联动。</p>
                <table className="admin-data-table" style={{ marginTop: 12 }}>
                    <thead>
                        <tr>
                            <th>名称</th>
                            <th>归属</th>
                            <th>状态</th>
                            <th>面向对象</th>
                            <th>能力域</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockAgents.map((item) => (
                            <tr key={item.id}>
                                <td><strong>{item.name}</strong></td>
                                <td>{item.owner}</td>
                                <td>{item.status}</td>
                                <td>{item.audience}</td>
                                <td>{item.ability}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
