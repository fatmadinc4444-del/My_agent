import { test, expect } from 'vitest';
import { mapBones, REQUIRED_BONES } from '../src/rig/boneMap';
test('mixamo', () => {
  const names = ['mixamorigHips','mixamorigSpine','mixamorigSpine1','mixamorigSpine2','mixamorigNeck','mixamorigHead','mixamorigLeftShoulder','mixamorigLeftArm','mixamorigLeftForeArm','mixamorigLeftHand','mixamorigLeftHandThumb1','mixamorigLeftHandThumb2','mixamorigLeftHandThumb3','mixamorigLeftHandIndex1','mixamorigLeftHandIndex2','mixamorigLeftHandIndex3','mixamorigRightShoulder','mixamorigRightArm','mixamorigRightForeArm','mixamorigRightHand','mixamorigLeftUpLeg','mixamorigLeftLeg','mixamorigLeftFoot','mixamorigLeftToeBase','mixamorigRightUpLeg','mixamorigRightLeg','mixamorigRightFoot','mixamorigLeftEye'];
  const m = mapBones(names);
  console.log(m);
  for (const r of REQUIRED_BONES) expect(m[r], r).toBeTruthy();
  expect(m['shin.L']).toBe('mixamorigLeftLeg');
  expect(m['upperArm.L']).toBe('mixamorigLeftArm');
  expect(m['foreArm.L']).toBe('mixamorigLeftForeArm');
  expect(m['chest']).toBe('mixamorigSpine2');
});
test('vrm & cc4', () => {
  const v = mapBones(['Hips','Spine','Chest','UpperChest','Neck','Head','LeftShoulder','LeftUpperArm','LeftLowerArm','LeftHand','LeftIndexProximal','LeftIndexIntermediate','LeftIndexDistal','LeftUpperLeg','LeftLowerLeg','LeftFoot']);
  expect(v['upperArm.L']).toBe('LeftUpperArm');
  expect(v['index2.L']).toBe('LeftIndexIntermediate');
  const c = mapBones(['CC_Base_Hip','CC_Base_Spine01','CC_Base_Spine02','CC_Base_NeckTwist01','CC_Base_Head','CC_Base_L_Clavicle','CC_Base_L_Upperarm','CC_Base_L_Forearm','CC_Base_L_Hand','CC_Base_L_Thigh','CC_Base_L_Calf','CC_Base_L_Foot','CC_Base_JawRoot']);
  console.log(c);
  expect(c['thigh.L']).toBe('CC_Base_L_Thigh');
  expect(c['hips']).toBe('CC_Base_Hip');
  expect(c['jaw']).toBe('CC_Base_JawRoot');
});
