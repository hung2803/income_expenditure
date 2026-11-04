type Loader = () => Promise<void>;
const loaders = new Set<Loader>();
let active: Promise<void> | undefined;

export function registerPageLoader(loader: Loader) {
  loaders.add(loader);
  return () => { loaders.delete(loader); };
}

// Only mounted screens participate. Repeated gestures share one refresh.
export function refreshPageData(): Promise<void> {
  if (active) return active;
  if (!navigator.onLine) return Promise.reject(new Error('Bạn đang offline. Nội dung hiện tại được giữ lại; hãy thử khi có mạng.'));
  active = Promise.allSettled([...loaders].map((load) => load())).then((results) => {
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('Không tải được dữ liệu mới. Nội dung hiện tại được giữ lại; hãy kéo xuống để thử lại.');
    }
  }).finally(() => { active = undefined; });
  return active;
}
