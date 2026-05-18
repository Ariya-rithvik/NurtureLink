import { Loader2 } from 'lucide-react';

export default function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 className="animate-spin" style={{ width: size, height: size }} />;
}
