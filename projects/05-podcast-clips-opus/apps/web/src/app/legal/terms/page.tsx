import { LegalDocument } from '../LegalDocument';
import { termsDocument } from '../../../lib/legal-documents';
export const metadata = { title: 'Пользовательское соглашение — КлипМейкер' };
export default function Page() { return <LegalDocument document={termsDocument} />; }
