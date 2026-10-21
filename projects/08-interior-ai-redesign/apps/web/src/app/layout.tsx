import type {Metadata} from 'next';
import './globals.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Комната · ремонт по вашему плану',description:'Обмеры, референсы, дизайн и честная смета ремонта.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="ru"><body>{children}</body></html>;}
