export const PASSWORD_MIN_LENGTH=12

export function passwordPolicyError(password:unknown){
 if(typeof password!=='string'||password.length<PASSWORD_MIN_LENGTH)return `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`
 if(password.length>128)return 'Password must not exceed 128 characters.'
 if(!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password))return 'Password must include uppercase, lowercase, number and symbol characters.'
 return null
}
