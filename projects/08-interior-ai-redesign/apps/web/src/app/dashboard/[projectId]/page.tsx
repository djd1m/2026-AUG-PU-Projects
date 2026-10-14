import {RoomEditor} from '../../../components/RoomEditor';
export default async function Page({params}:{params:Promise<{projectId:string}>}){const {projectId}=await params;return <RoomEditor projectId={projectId}/>;}
