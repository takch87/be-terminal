import { useEffect, useState } from 'react';
import { ApiClient } from '@be/sdk-client';

export default function Home() {
  const [summary, setSummary] = useState<any>();
  useEffect(() => {
    const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');
    api.getSummary({}).then(setSummary).catch(console.error);
  }, []);
  return (
    <main style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <pre>{JSON.stringify(summary, null, 2)}</pre>
    </main>
  );
}