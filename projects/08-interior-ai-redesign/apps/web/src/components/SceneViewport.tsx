"use client";
import {useEffect,useState,useCallback} from 'react';
import type {Ref} from 'react';
import type {SceneViewer,SceneViewerProps,SceneViewerHandle} from '@n8/viewer';
export function SceneViewport({viewerRef,...props}:Omit<SceneViewerProps,'resolveAsset'>&{viewerRef?:Ref<SceneViewerHandle>}){
 const[Viewer,setViewer]=useState<typeof SceneViewer|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;import('@n8/viewer').then(module=>{if(active)setViewer(()=>module.SceneViewer);}).catch(()=>{if(active){setError('3D-просмотрщик недоступен.');props.onError?.('3D-просмотрщик недоступен.');}});return()=>{active=false;};},[]);
 const resolveAsset=useCallback(async(id:string)=>{const response=await fetch(`/api/assets/${encodeURIComponent(id)}?original=1`,{cache:'no-store'});if(!response.ok)throw new Error('Не удалось открыть приватный скан');return response.arrayBuffer();},[]);
 return <div className="preview-frame">{error?<p className="warning">{error}</p>:Viewer?<Viewer ref={viewerRef} {...props} resolveAsset={resolveAsset} onError={message=>{props.onError?.(message);}}/>:<p className="notice" role="status">Подготавливаем просмотр комнаты…</p>}</div>;
}
