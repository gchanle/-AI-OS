import '../admin-sections.css';

const mockUsers = [
    { id: 'u-001', name: '周亚敏', role: '学校管理员', department: '信息中心', status: '已开通', lastActive: '今天 09:42' },
    { id: 'u-002', name: '陈老师', role: '教师', department: '计算机学院', status: '已开通', lastActive: '今天 08:17' },
    { id: 'u-003', name: '李老师', role: '教师', department: '图书馆', status: '已开通', lastActive: '昨天 18:30' },
    { id: 'u-004', name: '王同学', role: '学生', department: '人工智能学院', status: '已开通', lastActive: '今天 10:10' },
    { id: 'u-005', name: '赵同学', role: '学生', department: '历史学院', status: '未开通', lastActive: '未登录' },
];

export default function AdminUsersPage() {
    return (
        <div className="admin-section-grid">
            <section className="admin-section-grid three">
                <article className="admin-section-card glass">
                    <small>用户总量</small>
                    <strong>5</strong>
                    <p>当前先用演示数据承载，后续直接替换为学校组织架构与统一认证用户。</p>
                </article>
                <article className="admin-section-card glass">
                    <small>教师可用</small>
                    <strong>2</strong>
                    <p>可继续补教师与学生不同的默认能力、默认模型和可见模块。</p>
                </article>
                <article className="admin-section-card glass">
                    <small>待开通</small>
                    <strong>1</strong>
                    <p>后续适合接组织同步、批量开通与禁用流程。</p>
                </article>
            </section>

            <section className="admin-section-table glass">
                <h3>用户列表</h3>
                <p>这里后续应接学校统一认证、组织架构、院系和角色绑定。当前先按后台样态把结构立起来。</p>
                <table className="admin-data-table" style={{ marginTop: 12 }}>
                    <thead>
                        <tr>
                            <th>姓名</th>
                            <th>角色</th>
                            <th>部门</th>
                            <th>状态</th>
                            <th>最近活跃</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockUsers.map((item) => (
                            <tr key={item.id}>
                                <td><strong>{item.name}</strong></td>
                                <td>{item.role}</td>
                                <td>{item.department}</td>
                                <td>{item.status}</td>
                                <td>{item.lastActive}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
