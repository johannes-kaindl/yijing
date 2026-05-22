/*
 * Yijing Orakel — nativer App-Launcher.
 *
 * macOS stuft .app-Bundles, deren CFBundleExecutable ein Shell-Skript ist,
 * auf Apple Silicon faelschlich als Intel-App ein und verlangt Rosetta
 * (kMDItemExecutableArchitectures ist dann null). Dieser winzige Launcher
 * wird daher als native Mach-O-Binary (arm64 + x86_64) kompiliert und ist
 * das CFBundleExecutable. Er startet nur das eigentliche Bash-Skript
 * Contents/Resources/launch.sh.
 */
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <libgen.h>
#include <unistd.h>
#include <mach-o/dyld.h>

int main(void) {
    char raw[PATH_MAX];
    uint32_t size = sizeof(raw);
    if (_NSGetExecutablePath(raw, &size) != 0) return 1;

    char self[PATH_MAX];
    if (realpath(raw, self) == NULL) return 1;   /* .../Contents/MacOS/Yijing */

    char script[PATH_MAX];
    snprintf(script, sizeof(script), "%s/../Resources/launch.sh", dirname(self));

    execl("/bin/bash", "bash", script, (char *)NULL);
    return 1;  /* nur erreicht, wenn execl fehlschlaegt */
}
