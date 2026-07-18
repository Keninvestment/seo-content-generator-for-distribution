
import React, { useCallback, useState } from 'react';
import { CheckCircleIcon } from './icons';

interface FileUploadProps {
    icon: React.ReactNode;
    title: string;
    file?: string | null;
    files?: File[];
    onFileUpload?: (content: string, file: File) => void;
    onFilesUpload?: (files: File[]) => void;
    accept: string;
    multiple?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ icon, title, file, files, onFileUpload, onFilesUpload, accept, multiple = false }) => {
    const [fileName, setFileName] = useState<string>('');
    const [fileCount, setFileCount] = useState<number>(0);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (multiple && onFilesUpload) {
            const uploadedFiles = Array.from(event.target.files || []);
            if (uploadedFiles.length > 0) {
                // 新しいファイルを既存のファイルに追加（最大10枚まで）
                const currentFiles = files || [];
                const combinedFiles = [...currentFiles, ...uploadedFiles];
                const finalFiles = combinedFiles.slice(0, 10); // 最大10枚までに制限
                onFilesUpload(finalFiles);
                setFileCount(finalFiles.length);
            }
        } else if (!multiple && onFileUpload) {
            const uploadedFile = event.target.files?.[0];
            if (uploadedFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target?.result as string;
                    onFileUpload(content, uploadedFile);
                    setFileName(uploadedFile.name);
                };
                reader.readAsText(uploadedFile);
            }
        }
    }, [multiple, onFileUpload, onFilesUpload, files]);

    const isUploaded = multiple ? (files && files.length > 0) : !!file;
    const uploadedCount = files?.length || (file ? 1 : 0);

    return (
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100">
                 {isUploaded ? <CheckCircleIcon className="w-8 h-8 text-indigo-600" /> : icon}
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">
                {isUploaded ? 
                    (multiple ? `${uploadedCount}枚アップロード済み（最大10枚まで）` : fileName) 
                    : multiple && title.includes('Base') ?
                        `ベース画像をアップロード（1～10枚）` :
                        `Upload your ${title.toLowerCase()} file(s).`}
            </p>
            <div className="mt-4">
                <label htmlFor={`file-upload-${title}`} className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    {isUploaded ? '追加/変更' : '画像を選択'}
                </label>
                {isUploaded && multiple && (
                    <button 
                        onClick={() => {
                            onFilesUpload?.([]);
                            setFileCount(0);
                        }}
                        className="ml-2 inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        クリア
                    </button>
                )}
                <input id={`file-upload-${title}`} name={`file-upload-${title}`} type="file" className="sr-only" accept={accept} multiple={multiple} onChange={handleFileChange} />
            </div>
            {/* アップロード済み画像のリスト表示 */}
            {isUploaded && multiple && files && files.length > 0 && (
                <div className="mt-3 text-left">
                    <p className="text-xs text-gray-600 font-semibold mb-1">アップロード済み画像:</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                        {files.map((file, idx) => (
                            <li key={idx} className="flex items-center justify-between">
                                <span className="truncate max-w-[200px]">
                                    {idx + 1}. {file.name}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        const newFiles = files.filter((_, i) => i !== idx);
                                        onFilesUpload?.(newFiles);
                                        setFileCount(newFiles.length);
                                    }}
                                    className="ml-2 text-red-500 hover:text-red-700"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
