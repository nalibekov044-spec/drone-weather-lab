#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <setjmp.h>
typedef unsigned short WCHAR;
#define ABI __attribute__((ms_abi))
static jmp_buf returnPoint;
static int exitCode, failWrite, launches;
static char launched[4096];
static WCHAR command[256];
static void pathText(char *out, const WCHAR *text) {
    size_t i = 0;
    while (text[i] && i < 4095) { out[i] = text[i] == '\\' ? '/' : (char)text[i]; ++i; }
    out[i] = 0;
}
uint32_t ABI GetTempPathW(uint32_t capacity, WCHAR *out) {
    const char *path = getenv("DRONE_LAUNCHER_TEST_DIR");
    size_t length = strlen(path);
    if (length + 1 >= capacity) return (uint32_t)length + 2;
    for (size_t i = 0; i < length; ++i) out[i] = (unsigned char)path[i];
    out[length] = '/'; out[length + 1] = 0;
    return (uint32_t)length + 1;
}
int ABI CreateDirectoryW(const WCHAR *path, void *unused) {
    char name[4096]; pathText(name, path);
    return mkdir(name, 0700) == 0;
}
void *ABI CreateFileW(const WCHAR *path, uint32_t access, uint32_t share, void *security, uint32_t creation, uint32_t flags, void *templateFile) {
    char name[4096]; pathText(name, path);
    FILE *file = fopen(name, "wb");
    return file ? file : (void *)(intptr_t)-1;
}
int ABI WriteFile(void *handle, const void *buffer, uint32_t count, uint32_t *written, void *overlapped) {
    if (failWrite) { *written = 0; return 0; }
    if (count > 8192) count = 8192;
    *written = (uint32_t)fwrite(buffer, 1, count, handle);
    return *written > 0;
}
int ABI CloseHandle(void *handle) { return fclose(handle) == 0; }
void *ABI ShellExecuteW(void *window, const WCHAR *operation, const WCHAR *file, const WCHAR *arguments, const WCHAR *directory, int show) {
    pathText(launched, file); ++launches;
    return (void *)(intptr_t)33;
}
int ABI MessageBoxW(void *window, const WCHAR *text, const WCHAR *title, unsigned flags) { return 1; }
WCHAR *ABI GetCommandLineW(void) { return command; }
void ABI ExitProcess(unsigned code) { exitCode = (int)code; longjmp(returnPoint, 1); }
int invokeLauncher(void *entry, int extractOnly, int writeFailure) {
    const char *text = extractOnly ? "simulator.exe --extract-only" : "simulator.exe";
    memset(command, 0, sizeof(command));
    for (size_t i = 0; text[i]; ++i) command[i] = (unsigned char)text[i];
    failWrite = writeFailure; exitCode = -1; launches = 0; launched[0] = 0;
    if (!setjmp(returnPoint)) ((void (ABI *)(void))entry)();
    return exitCode;
}
int launchCount(void) { return launches; }
const char *launchPath(void) { return launched; }
