import Link from 'next/link';
import type { VideoScreen } from '../../lib/screen-contract';
// Adapted donor exports: VideoList, VideoRow, VideoThumbnail.
export function VideoThumbnail({ alt }: { alt: string }) {
  return <div className="video-thumbnail" role="img" aria-label={alt}>▶</div>;
}
export function VideoRow({ video }: { video: VideoScreen }) {
  return <Link className="video-row" href={`/dashboard/videos/${video.video_id}`}>
    <VideoThumbnail alt="Запись" /><div className="video-summary"><strong>Запись от {new Date(video.created_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</strong>
      <p>{video.duration_seconds === null ? 'Длительность уточняется' : `${Math.round(video.duration_seconds / 60)} мин`} · Готово клипов: {video.clips_done}</p>
      <span className={`badge ${video.no_response ? 'silent' : video.status === 'failed' ? 'failure' : video.status === 'done' ? 'success' : 'running'}`}>
        {video.no_response ? video.stage_label : `${video.user_state} · ${video.stage_label}`}</span>
      {video.failure_reason && <p>{video.failure_reason}</p>}</div><span aria-hidden="true">→</span></Link>;
}
export function VideoList({ videos, nextCursor }: { videos: VideoScreen[]; nextCursor: string | null }) {
  return <section><h2>Ваши записи</h2>{videos.length ? <div className="video-list">{videos.map(video => <VideoRow key={video.video_id} video={video} />)}</div>
    : <div className="empty"><h3>Здесь появятся ваши записи</h3><p>Загрузите подкаст или вебинар, чтобы получить первые клипы.</p></div>}
    {nextCursor && <Link className="button secondary" href={`/dashboard?cursor=${nextCursor}`}>Следующие записи →</Link>}</section>;
}
