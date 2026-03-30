import CliCenter from '@/components/CliCenter';
import { listCliPackages } from '@/lib/cliPackages';

export const metadata = {
    title: 'CLI 管理 - 超星 AI 校园 OS',
    description: '统一管理客户侧、本地工具与受控执行能力的配置、授权和巡检状态。',
};

export default function ConnectorCliPage() {
    const initialCliPackages = listCliPackages();
    return <CliCenter initialCliPackages={initialCliPackages} />;
}
