import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import { GitDiff } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export class GitAnalyzer {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async validateRepository(): Promise<void> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error('Current directory is not a Git repository');
    }
  }

  async getUnstagedChanges(): Promise<GitDiff[]> {
    await this.validateRepository();
    const status = await this.git.status();
    const modifiedFiles = [...status.modified, ...status.not_added];
    
    const diffs: GitDiff[] = [];
    for (const file of modifiedFiles) {
      try {
        const diff = await this.git.diff([file]);
        const parsed = await this.parseSingleFileDiff(file, diff, false);
        if (parsed) diffs.push(parsed);
      } catch (error) {
        console.warn(`Failed to get diff for file ${file}:`, error);
      }
    }
    
    return diffs;
  }

  async getStagedChanges(): Promise<GitDiff[]> {
    await this.validateRepository();
    const status = await this.git.status();
    const stagedFiles = status.staged;
    
    const diffs: GitDiff[] = [];
    for (const file of stagedFiles) {
      try {
        const diff = await this.git.diff(['--cached', file]);
        const parsed = await this.parseSingleFileDiff(file, diff, true);
        if (parsed) diffs.push(parsed);
      } catch (error) {
        console.warn(`Failed to get staged diff for file ${file}:`, error);
      }
    }
    
    return diffs;
  }

  async getCommitDiff(commitHash?: string): Promise<GitDiff[]> {
    await this.validateRepository();
    
    const diffSummary = commitHash
      ? await this.git.diffSummary([`${commitHash}^`, commitHash])
      : await this.git.diffSummary(['HEAD^', 'HEAD']);

    const diffs: GitDiff[] = [];
    for (const file of diffSummary.files) {
      try {
        const diff = commitHash
          ? await this.git.diff([`${commitHash}^`, commitHash, '--', file.file])
          : await this.git.diff(['HEAD^', 'HEAD', '--', file.file]);
        
        const fileStats = file as any; // Type assertion для доступа к статистике
        const parsed = await this.parseSingleFileDiff(file.file, diff, false, {
          additions: fileStats.insertions || 0,
          deletions: fileStats.deletions || 0,
          isNew: (fileStats.insertions || 0) > 0 && (fileStats.deletions || 0) === 0,
          isDeleted: (fileStats.insertions || 0) === 0 && (fileStats.deletions || 0) > 0
        });
        
        if (parsed) diffs.push(parsed);
      } catch (error) {
        console.warn(`Failed to get diff for commit ${file.file}:`, error);
      }
    }
    
    return diffs;
  }

  private async parseSingleFileDiff(
    fileName: string, 
    diffText: string, 
    isStaged: boolean,
    stats?: { additions: number; deletions: number; isNew: boolean; isDeleted: boolean }
  ): Promise<GitDiff | null> {
    if (!diffText.trim()) return null;

    const isBinary = diffText.includes('Binary files') || diffText.includes('differ');
    
    let additions = 0;
    let deletions = 0;
    let isNew = false;
    let isDeleted = false;

    if (stats) {
      ({ additions, deletions, isNew, isDeleted } = stats);
    } else {
      // Более надежный подсчет изменений
      const lines = diffText.split('\n');
      isNew = lines.some(line => line.startsWith('new file mode'));
      isDeleted = lines.some(line => line.startsWith('deleted file mode'));
      
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }
    }

    // Получаем размер файла если возможно
    let fileSize: number | undefined;
    try {
      const fullPath = path.join(this.repoPath, fileName);
      if (fs.existsSync(fullPath) && !isDeleted) {
        const stats = fs.statSync(fullPath);
        fileSize = stats.size;
      }
    } catch (error) {
      // Игнорируем ошибки получения размера файла
    }

    return {
      file: fileName,
      additions,
      deletions,
      changes: diffText,
      isNew,
      isDeleted,
      isBinary,
      fileSize,
    };
  }
} 
