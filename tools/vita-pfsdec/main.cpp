// vita-pfsdec: decrypts a PS Vita NoNpDRM game folder (eboot.bin, sce_sys/, sce_pfs/) the same way
// Vita3K's installer does, using Vita3K's psvpfsparser with its offline (native) F00D key encryptor.
//
//   vita-pfsdec <src dir> <dst dir> <work.bin>
//
// The output has no sce_pfs/ and installs into Vita3K by plain copying. eboot.bin and *.suprx stay
// retail-encrypted SELFs, so work.bin must still be installed as ux0/license/<TITLE_ID>/<CONTENT_ID>.rif.
// Exit codes: 0 ok, 1 decryption failed, 2 bad arguments / unreadable license.

#include <cstdint> // PfsProgress.h uses std::uint64_t without including it
#include <fstream>
#include <iostream>
#include <string>

#include "PsvPfsParserConfig.h"
#include "rif2zrif.h"

int main(int argc, char **argv) {
    if (argc != 4) {
        std::cerr << "usage: vita-pfsdec <src dir> <dst dir> <work.bin>" << std::endl;
        return 2;
    }
    std::ifstream license(argv[3], std::ios::in | std::ios::binary | std::ios::ate);
    if (!license) {
        std::cerr << "can't read license " << argv[3] << std::endl;
        return 2;
    }
    std::string zrif = rif2zrif(license);
    if (zrif.empty()) {
        std::cerr << "invalid license " << argv[3] << std::endl;
        return 2;
    }
    std::string src = argv[1], dst = argv[2], f00dArg;
    return execute(zrif, src, dst, F00DEncryptorTypes::native, f00dArg) < 0 ? 1 : 0;
}
