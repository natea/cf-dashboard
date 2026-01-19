// dashboard/src/components/CreateClaimForm.tsx
import { useState } from "react";
import { createClaim } from "../lib/api";

interface CreateClaimFormProps {
  onClose: () => void;
}

export function CreateClaimForm({ onClose }: CreateClaimFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueId, setIssueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !issueId.trim()) {
      setError("Title and Issue ID are required");
      return;
    }

    setLoading(true);
    try {
      await createClaim({
        issueId: issueId.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        source: "manual",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create claim");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Claim</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="issueId" className="block text-sm font-medium text-gray-700 mb-1">
              Issue ID *
            </label>
            <input
              id="issueId"
              type="text"
              value={issueId}
              onChange={(e) => setIssueId(e.target.value)}
              placeholder="e.g., TASK-001"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the task"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Claim"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
