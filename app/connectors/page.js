import { redirect } from 'next/navigation';

export default function ConnectorsPage() {
    redirect('/admin/access?tab=catalog');
}
