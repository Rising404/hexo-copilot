import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import App from '../../App';

jest.mock('../../services/realFileService', () => ({
  realFileService: {
    getConfig: jest.fn().mockResolvedValue({ hexo_path: null, llm_provider: 'gemini', providers: { gemini: { api_key: null }, openai: { api_key: null } } }),
    saveConfig: jest.fn().mockResolvedValue({ is_hexo: false, posts_path: '/fake/workspace' }),
    initPostsFolder: jest.fn().mockResolvedValue({ status: 'created', posts_path: '/fake/workspace/source/_posts' }),
    getFiles: jest.fn().mockResolvedValue([]),
    getFolders: jest.fn().mockResolvedValue([]),
  },
}));

describe('Setup flow', () => {
  test('shows create posts folder when save returns is_hexo false and create works', async () => {
    render(<App />);

    // Wait for initial loading
    expect(await screen.findByText('Hexo Copilot Setup')).toBeInTheDocument();

    // Enter a path (input is present)
    const input = screen.getByPlaceholderText('e.g., D:/Blog/my-hexo-site');
    fireEvent.change(input, { target: { value: 'D:/fake/workspace' } });

    // Click Save and Start Copilot
    const btn = screen.getByText('Save and Start Copilot');
    fireEvent.click(btn);

    // The mocked saveConfig returns is_hexo false, so the create posts message should appear
    expect(await screen.findByText(/No Hexo `source\/_posts` folder detected/i)).toBeInTheDocument();

    // Click create posts folder
    const createBtn = screen.getByText('Create posts folder');
    fireEvent.click(createBtn);

    // Expect the initPostsFolder mock to have been called and then file listing attempted
    const { realFileService } = require('../../services/realFileService');
    await waitFor(() => expect(realFileService.initPostsFolder).toHaveBeenCalled());
  });

  test('hexo-detected case triggers refresh', async () => {
    // Override mock to simulate is_hexo true
    const { realFileService } = require('../../services/realFileService');
    realFileService.saveConfig.mockResolvedValueOnce({ is_hexo: true, posts_path: '/fake/workspace/source/_posts' });

    render(<App />);
    expect(await screen.findByText('Hexo Copilot Setup')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('e.g., D:/Blog/my-hexo-site');
    fireEvent.change(input, { target: { value: 'D:/fake/workspace' } });

    const btn = screen.getByText('Save and Start Copilot');
    fireEvent.click(btn);

    // When is_hexo is true, the app should attempt to refresh files (getFiles called)
    await waitFor(() => expect(realFileService.getFiles).toHaveBeenCalled());
  });
});
