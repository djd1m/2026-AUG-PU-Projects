import { LegalDocument } from '../LegalDocument';
import { privacyDocument } from '../../../lib/legal-documents';
export const metadata = { title: 'Политика конфиденциальности — КлипМейкер' };
export default function Page() { return <LegalDocument document={privacyDocument} />; }
