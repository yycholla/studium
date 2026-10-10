"""Exercise the real C ABI from another runtime, including ownership and UTF-8.

Usage: python3 tests/native.py target/debug/libchatpendium_native.so
Also accepts the Windows DLL when run with Windows Python.
"""
import ctypes
import json
import sys

library = ctypes.CDLL(sys.argv[1])
library.chatpendium_abi_version.restype = ctypes.c_uint32
library.chatpendium_execute.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
library.chatpendium_execute.restype = ctypes.c_void_p
library.chatpendium_free.argtypes = [ctypes.c_void_p]
library.chatpendium_free.restype = None
assert library.chatpendium_abi_version() == 1


def raw(payload):
    buffer = ctypes.create_string_buffer(payload)
    pointer = library.chatpendium_execute(buffer, len(payload))
    assert pointer
    try:
        return json.loads(ctypes.string_at(pointer))
    finally:
        library.chatpendium_free(pointer)


def call(request):
    response = raw(json.dumps(request, ensure_ascii=False).encode("utf-8"))
    assert response["ok"], response
    return response["data"]


catalog = call({"op": "catalog"})
assert catalog["schema_version"] == 1
assert call({"op": "validate", "catalog": catalog}) == catalog

for _ in range(100):
    result = call({"op": "search", "catalog": catalog,
                   "filter": {"query": "♥", "favorites_only": True, "favorites": ["heart"]}})
    assert len(result["entries"]) == 1
    assert result["entries"][0]["text"] == "♥"

assert not raw(b"\xff")["ok"]
assert not raw(b'{"op":"search"}')["ok"]
catalog["entries"][0]["text"] = "bad\n/p message"
assert not raw(json.dumps({"op": "validate", "catalog": catalog}).encode())["ok"]
library.chatpendium_free(None)
print("Native ABI passed: UTF-8, catalog, filtering, rejected input, repeated allocation/free.")
