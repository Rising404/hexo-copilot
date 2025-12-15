import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import TrashView from '../TrashView';

// Mock the realFileService module
jest.mock('../../services/realFileService', () => ({
  realFileService: {
    listTrash: jest.fn(),
    restoreTrashBatch: jest.fn(),
    permanentDeleteBatch: jest.fn(),
  },
}));

import { realFileService } from '../../services/realFileService';

describe('TrashView (mocked)', () => {
  beforeEach(() => {
    (realFileService.listTrash as jest.Mock).mockResolvedValue([
      '20250101T000000Z/post-a.md',
      '20250101T000000Z/subdir/post-b.md',
    ]);
  });

  test('renders items and supports multi-select and batch restore progress', async () => {
    render(<TrashView open={true} onClose={() => {}} />);

    // wait for items to appear
    expect(await screen.findByText('20250101T000000Z/post-a.md')).toBeInTheDocument();

    // select items
    const checkboxes = screen.getAllByRole('checkbox');
    // first checkbox is select-all
    fireEvent.click(checkboxes[0]);

    const restoreBtn = screen.getByText('Restore Selected');
    expect(restoreBtn).toBeEnabled();

    // Simulate progress callback to update UI
    (realFileService.restoreTrashBatch as jest.Mock).mockImplementation((paths, options) => {
      // call progress for first item
      options.onProgress(1, paths.length, paths[0], true);
      // call progress for second item
      options.onProgress(2, paths.length, paths[1], true);
      return Promise.resolve(paths.map((p: string) => ({ path: p, ok: true })));
    });

    fireEvent.click(restoreBtn);

    // wait for progress bar update
    await waitFor(() => screen.getByText('Batch operation progress: 2/2'));

    // each item should show Done status
    expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(1);
  });

  test('batch delete requires confirmation', async () => {
    render(<TrashView open={true} onClose={() => {}} />);
    expect(await screen.findByText('20250101T000000Z/post-a.md')).toBeInTheDocument();

    // select all
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    const deleteBtn = screen.getByText('Delete Selected');
    fireEvent.click(deleteBtn);

    // confirmation modal should appear
    expect(screen.getByText('Permanent Delete (Selected)')).toBeInTheDocument();
  });

  test('partial failure and retry', async () => {
    render(<TrashView open={true} onClose={() => {}} />);
    expect(await screen.findByText('20250101T000000Z/post-a.md')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    // first call: one success, one failure
    (realFileService.restoreTrashBatch as jest.Mock).mockImplementationOnce((paths, options) => {
      options.onProgress(1, paths.length, paths[0], true);
      options.onProgress(2, paths.length, paths[1], false);
      return Promise.resolve([ { path: paths[0], ok: true }, { path: paths[1], ok: false, error: 'Conflict' } ]);
    });

    fireEvent.click(screen.getByText('Restore Selected'));

    // wait for failure status
    await waitFor(() => screen.getByText('Failed'));

    // now mock a successful retry
    (realFileService.restoreTrashBatch as jest.Mock).mockImplementationOnce((paths, options) => {
      options.onProgress(1, paths.length, paths[0], true);
      options.onProgress(2, paths.length, paths[1], true);
      return Promise.resolve(paths.map((p: string) => ({ path: p, ok: true })));
    });

    // retry
    fireEvent.click(screen.getByText('Restore Selected'));

    // wait for both to be Done
    await waitFor(() => screen.getAllByText('Done'));
    expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(2);
  });

  test('cancel during batch', async () => {
    render(<TrashView open={true} onClose={() => {}} />);
    expect(await screen.findByText('20250101T000000Z/post-a.md')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    // make restore call hang (simulate long running)
    (realFileService.restoreTrashBatch as jest.Mock).mockImplementation((paths, options) => {
      // report first item progress
      options.onProgress(1, paths.length, paths[0], true);
      // never resolve
      return new Promise(() => {});
    });

    fireEvent.click(screen.getByText('Restore Selected'));

    // Wait for progress to appear, then cancel
    await waitFor(() => screen.getByText('Batch operation progress: 1/2'));
    fireEvent.click(screen.getByText('Cancel'));

    // UI should show cancelled statuses
    await waitFor(() => screen.getByText('Cancelled'));
  });
});
