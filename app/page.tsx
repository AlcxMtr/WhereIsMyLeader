import dynamic from 'next/dynamic';

// Dynamically import the Map component, turning OFF SSR
const DynamicMap = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <p className="text-center mt-20">Loading map...</p>
});

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <div className="w-full h-screen">
        <DynamicMap />
      </div>
    </main>
  );
}