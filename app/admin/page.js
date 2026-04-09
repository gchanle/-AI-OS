import Link from 'next/link';
import { listSkillPackages } from '@/lib/skillPackages';
import { listFireflyRuntimeState } from '@/lib/fireflyRuntimeStore';
import './admin-sections.css';

export default async function AdminOverviewPage() {
    const runtime = await listFireflyRuntimeState();
    const skills = listSkillPackages();

    const overviewCards = [
        {
            label: '学校策略',
            value: 3,
            desc: '当前已对用户端开放的学校模块入口',
            href: '/admin/access',
        },
        {
            label: '知识源',
            value: 2,
            desc: '学校侧知识与规范来源',
            href: '/admin/access',
        },
        {
            label: '官方能力',
            value: skills.length,
            desc: '已登记的 Skill / 能力制品',
            href: '/admin/access',
        },
        {
            label: '运行会话',
            value: runtime.sessions.length,
            desc: '最近被后台观测到的萤火虫服务端会话',
            href: '/admin/access',
        },
    ];

    return (
        <div className="admin-section-grid">
            <section className="admin-section-hero glass-strong">
                <h2>把学校级治理和用户侧体验彻底分开</h2>
                <p>这里不再是用户端顶部多出来的一个页面，而是独立后台的总览入口。你可以从这里进入用户管理、接入管理和智能体管理，后续再继续接认证、组织架构和真实运营数据。</p>
                <div className="admin-section-actions">
                    <Link href="/admin/access" className="admin-section-link primary">进入接入管理</Link>
                    <Link href="/admin/users" className="admin-section-link">查看用户管理</Link>
                    <Link href="/admin/agents" className="admin-section-link">查看智能体管理</Link>
                </div>
            </section>

            <section className="admin-section-grid three">
                {overviewCards.map((item) => (
                    <article key={item.label} className="admin-section-card glass">
                        <small>{item.label}</small>
                        <strong>{item.value}</strong>
                        <p>{item.desc}</p>
                        <div className="admin-section-actions">
                            <Link href={item.href} className="admin-section-link">进入查看</Link>
                        </div>
                    </article>
                ))}
            </section>

            <section className="admin-section-grid two">
                <article className="admin-section-card glass">
                    <h3>当前后台分工</h3>
                    <div className="admin-chip-list" style={{ marginTop: 14 }}>
                        <span className="admin-chip active">用户管理</span>
                        <span className="admin-chip active">接入管理</span>
                        <span className="admin-chip active">智能体管理</span>
                    </div>
                    <p>下一步继续补组织架构、审批授权、发布审核和运营报表，就能更接近真正可交付的学校后台。</p>
                </article>

                <article className="admin-section-card glass">
                    <h3>为什么把后台拆出去</h3>
                    <p>因为产品经理、学校信息中心老师和普通师生看到的界面不应该是一套。用户端要尽量轻，后台才承载治理、接入、发布和观测。</p>
                </article>
            </section>
        </div>
    );
}
