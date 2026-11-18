#include <stdint.h>
#include <stddef.h>
#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#else
typedef unsigned short WCHAR;
typedef uint32_t DWORD;
typedef void *HANDLE;
#define WINAPI __attribute__((ms_abi))
extern DWORD WINAPI GetTempPathW(DWORD, WCHAR *);
extern int WINAPI CreateDirectoryW(const WCHAR *, void *);
extern HANDLE WINAPI CreateFileW(const WCHAR *, DWORD, DWORD, void *, DWORD, DWORD, HANDLE);
extern int WINAPI WriteFile(HANDLE, const void *, DWORD, DWORD *, void *);
extern int WINAPI CloseHandle(HANDLE);
extern HANDLE WINAPI ShellExecuteW(HANDLE, const WCHAR *, const WCHAR *, const WCHAR *, const WCHAR *, int);
extern int WINAPI MessageBoxW(HANDLE, const WCHAR *, const WCHAR *, unsigned);
extern WCHAR *WINAPI GetCommandLineW(void);
extern void WINAPI ExitProcess(unsigned) __attribute__((noreturn));
#endif
#include "simulator-data.h"
static WCHAR destination[1024];
static const WCHAR folderName[] = u"DroneWeatherLab-0.91-Beta";
static const WCHAR fileName[] = u"\\Drone-Weather-Lab-0.91-Beta.html";
static const WCHAR extractFlag[] = u"--extract-only";
static const WCHAR title[] = u"Drone Weather Lab 0.91 Beta";
static const WCHAR errorText[] = u"Could not open the simulator. Download the HTML version and open it directly.";
static const WCHAR openVerb[] = u"open";
static size_t append(size_t at, const WCHAR *text) {
    while (*text && at < 1023) destination[at++] = *text++;
    destination[at] = 0;
    return at;
}
static int contains(const WCHAR *text, const WCHAR *word) {
    for (; *text; ++text) {
        size_t i = 0;
        while (word[i] && text[i] == word[i]) ++i;
        if (!word[i]) return 1;
    }
    return 0;
}
void WINAPI LauncherStart(void) {
    int extractOnly = contains(GetCommandLineW(), extractFlag);
    DWORD length = GetTempPathW(512, destination);
    if (!length || length >= 512) goto failed;
    size_t at = append(length, folderName);
    CreateDirectoryW(destination, NULL);
    append(at, fileName);
    HANDLE file = CreateFileW(destination, 0x40000000u, 1u, NULL, 2u, 0x80u, NULL);
    if (file == (HANDLE)(intptr_t)-1) goto failed;
    DWORD total = 0;
    while (total < sizeof(simulatorData)) {
        DWORD written = 0;
        int ok = WriteFile(file, simulatorData + total, (DWORD)sizeof(simulatorData) - total, &written, NULL);
        if (!ok || !written) { CloseHandle(file); goto failed; }
        total += written;
    }
    if (!CloseHandle(file)) goto failed;
    if (!extractOnly && (intptr_t)ShellExecuteW(NULL, openVerb, destination, NULL, NULL, 1) <= 32) goto failed;
    ExitProcess(0);
failed:
    if (!extractOnly) MessageBoxW(NULL, errorText, title, 0x10u);
    ExitProcess(1);
}
