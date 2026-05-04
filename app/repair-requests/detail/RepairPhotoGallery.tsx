"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PhotoItem = {
  id: string;
  file_path: string;
  signed_url?: string | null;
};

function getFileNameFromPath(filePath: string) {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

export default function RepairPhotoGallery({
  photos,
}: {
  photos: PhotoItem[];
}) {
  const router = useRouter();

  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleDelete(photo: PhotoItem) {
    const ok = window.confirm("この写真を削除しますか？");
    if (!ok) return;

    setDeletingId(photo.id);
    setErrorMessage("");

    try {
      const res = await fetch("/api/repair-request-attachments", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: photo.id,
          file_path: photo.file_path,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "写真の削除に失敗しました");
      }

      setSelectedPhoto(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "写真の削除に失敗しました"
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (photos.length === 0) {
    return (
      <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
        添付写真はありません。
      </div>
    );
  }

  return (
    <>
      {errorMessage ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4">
        {photos.map((photo, index) => (
          <div key={photo.id} className="rounded-xl border p-3">
            <button
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              className="w-full text-left hover:bg-gray-50"
            >
              <div className="mb-2 text-xs font-semibold text-gray-500">
                現場写真 {index + 1}
              </div>

              {photo.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.signed_url}
                  alt={`現場写真 ${index + 1}`}
                  className="h-56 w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-56 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
                  写真を表示できません
                </div>
              )}

              <div className="mt-3 break-all text-xs text-gray-500">
                {getFileNameFromPath(photo.file_path)}
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleDelete(photo)}
              disabled={deletingId === photo.id}
              className="mt-3 w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deletingId === photo.id ? "削除中..." : "この写真を削除"}
            </button>
          </div>
        ))}
      </div>

      {selectedPhoto?.signed_url ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">現場写真プレビュー</div>
                <div className="break-all text-xs text-gray-500">
                  {getFileNameFromPath(selectedPhoto.file_path)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto.signed_url}
              alt="現場写真プレビュー"
              className="max-h-[75vh] w-full rounded-xl object-contain"
            />

            <button
              type="button"
              onClick={() => handleDelete(selectedPhoto)}
              disabled={deletingId === selectedPhoto.id}
              className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deletingId === selectedPhoto.id ? "削除中..." : "この写真を削除"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}