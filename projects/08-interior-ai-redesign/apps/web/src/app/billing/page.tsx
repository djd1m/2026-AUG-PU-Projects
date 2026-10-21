import Link from 'next/link';
import {BillingPanel} from '../../components/BillingPanel';
export default function BillingPage(){return <main className="workspace"><header className="brandbar"><Link className="brand" href="/dashboard">комната<span>мой ремонт</span></Link><Link className="button secondary" href="/dashboard">Личный кабинет</Link></header><BillingPanel/></main>;}
