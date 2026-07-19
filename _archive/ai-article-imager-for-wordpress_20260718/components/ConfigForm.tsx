
import React from 'react';
import { WPConfig, PostConfig } from '../types';

interface ConfigFormProps {
    wpConfig: WPConfig;
    setWpConfig: React.Dispatch<React.SetStateAction<WPConfig>>;
    postConfig: PostConfig;
    setPostConfig: React.Dispatch<React.SetStateAction<PostConfig>>;
    promptStyle: string;
    setPromptStyle: React.Dispatch<React.SetStateAction<string>>;
}

export const ConfigForm: React.FC<ConfigFormProps> = ({ wpConfig, setWpConfig, postConfig, setPostConfig, promptStyle, setPromptStyle }) => {
    const handleWpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setWpConfig({ ...wpConfig, [e.target.name]: e.target.value });
    };

    const handlePostChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setPostConfig({ ...postConfig, [e.target.name]: e.target.value });
    };

    return (
        <div className="bg-white p-8 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">WordPress Settings</h3>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="wp-base" className="block text-sm font-medium text-gray-700">WP Base URL</label>
                            <input type="text" name="base" id="wp-base" value={wpConfig.base} onChange={handleWpChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="https://example.com" />
                        </div>
                        <div>
                            <label htmlFor="wp-user" className="block text-sm font-medium text-gray-700">Username</label>
                            <input type="text" name="user" id="wp-user" value={wpConfig.user} onChange={handleWpChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="your_user" />
                        </div>
                        <div>
                            <label htmlFor="wp-app_password" className="block text-sm font-medium text-gray-700">Application Password</label>
                            <input type="password" name="app_password" id="wp-app_password" value={wpConfig.app_password} onChange={handleWpChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="xxxx xxxx xxxx xxxx" />
                        </div>
                    </div>
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Post Settings</h3>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="post-title" className="block text-sm font-medium text-gray-700">Post Title</label>
                            <input type="text" name="title" id="post-title" value={postConfig.title} onChange={handlePostChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label htmlFor="post-status" className="block text-sm font-medium text-gray-700">Post Status</label>
                            <select id="post-status" name="status" value={postConfig.status} onChange={handlePostChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                                <option value="draft">Draft</option>
                                <option value="publish">Publish</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="prompt-style" className="block text-sm font-medium text-gray-700">Prompt Style</label>
                            <input
                                type="text"
                                name="prompt-style"
                                id="prompt-style"
                                value={promptStyle}
                                onChange={(e) => setPromptStyle(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="e.g., Simple and clean illustration"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
