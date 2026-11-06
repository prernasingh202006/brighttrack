import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <EmptyState title="Page not found" action={<Link to="/" className="btn-primary mt-2">Back to home</Link>}>
      This street seems to be unlit. The page you wanted does not exist.
    </EmptyState>
  );
}
