//! Only this boundary crate uses unsafe code; all catalog/search logic is safe Rust.
use std::{
    ffi::{CString, c_char},
    panic::{AssertUnwindSafe, catch_unwind},
    ptr,
};

#[unsafe(no_mangle)]
pub extern "C" fn chatpendium_abi_version() -> u32 {
    1
}

/// Execute a UTF-8 JSON request. The caller owns the returned NUL-terminated UTF-8
/// response and must release it exactly once using `chatpendium_free`.
/// Null indicates an internal panic. Ordinary errors return JSON with `ok: false`.
///
/// # Safety
/// `input` must point to `length` readable bytes for the duration of this call.
/// Null and oversized input are rejected before dereferencing.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chatpendium_execute(input: *const u8, length: usize) -> *mut c_char {
    catch_unwind(AssertUnwindSafe(|| {
        let result = if input.is_null() || length > chatpendium_core::MAX_REQUEST_BYTES {
            Err("Invalid input buffer.".to_string())
        } else {
            // SAFETY: The caller guarantees readable bytes; no reference escapes this call.
            chatpendium_core::execute(unsafe { std::slice::from_raw_parts(input, length) })
        };
        let response = match result {
            Ok(data) => serde_json::json!({"ok":true, "data":data}),
            Err(error) => serde_json::json!({"ok":false, "error":error}),
        };
        // JSON escapes embedded NULs; CString cannot fail on valid JSON output.
        CString::new(response.to_string()).map_or(ptr::null_mut(), CString::into_raw)
    }))
    .unwrap_or(ptr::null_mut())
}

/// # Safety
/// `response` must be null or a still-owned pointer returned by this library's
/// `chatpendium_execute`. Do not use the pointer after this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chatpendium_free(response: *mut c_char) {
    if !response.is_null() {
        // SAFETY: Paired with CString::into_raw above; the caller transfers ownership back.
        drop(unsafe { CString::from_raw(response) });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CStr;

    #[test]
    fn ffi_round_trip_and_invalid_input() {
        for request in [br#"{"op":"catalog"}"#.as_slice(), b"invalid"] {
            // SAFETY: Valid request slice, followed by exactly one matching free.
            unsafe {
                let response = chatpendium_execute(request.as_ptr(), request.len());
                assert!(!response.is_null());
                let value: serde_json::Value =
                    serde_json::from_slice(CStr::from_ptr(response).to_bytes()).unwrap();
                assert_eq!(value["ok"], request[0] == b'{');
                chatpendium_free(response);
            }
        }
        unsafe {
            let response = chatpendium_execute(ptr::null(), 0);
            assert!(
                CStr::from_ptr(response)
                    .to_str()
                    .unwrap()
                    .contains("Invalid input buffer")
            );
            chatpendium_free(response);
            chatpendium_free(ptr::null_mut());
        }
    }
}
