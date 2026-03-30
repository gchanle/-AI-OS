import CliCenter from '@/components/CliCenter';
import { listCliPackages } from '@/lib/cliPackages';

export default async function ConnectorCliDetailPage({ params }) {
    const resolvedParams = await params;
    const initialCliPackages = listCliPackages();

    return (
        <CliCenter
            initialCliId={resolvedParams?.id || null}
            initialCliPackages={initialCliPackages}
        />
    );
}
