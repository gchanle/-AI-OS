import AdminShell from '@/components/admin/AdminShell';

export const metadata = {
    title: 'AI 校园 OS 管理后台',
    description: '面向学校管理员的信息化后台，统一管理用户、接入与智能体策略。',
};

export default function AdminLayout({ children }) {
    return (
        <AdminShell>
            {children}
        </AdminShell>
    );
}
